import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { Layers, FileVideo, Play, Trash2, CheckCircle, Loader2, AlertCircle } from "lucide-react"

interface BatchFile {
    id: string;
    path: string;
    status: 'pending' | 'processing' | 'done' | 'error';
    error?: string;
}

interface GlossaryItem {
    id: string;
    original: string;
    translated: string;
}

interface SubtitleEvent {
    index: number;
    start_ms: number;
    end_ms: number;
    actor: string;
    style: string;
    text_only: string;
    raw_text: string;
}

interface SubtitleFile {
    events: SubtitleEvent[];
    format: any;
    header: string;
}

export function BatchQueue({
    open: isOpen,
    onOpenChange,
    glossary
}: {
    open: boolean,
    onOpenChange: (open: boolean) => void,
    glossary: GlossaryItem[]
}) {
    const [queue, setQueue] = useState<BatchFile[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [progress, setProgress] = useState(0)

    const handleAddFiles = async () => {
        try {
            const selected = await open({
                multiple: true,
                filters: [{ name: 'Media Files', extensions: ['ass', 'srt', 'mkv'] }]
            });

            if (selected) {
                const paths = Array.isArray(selected) ? selected : [selected];
                // Limit to 20 files total
                const remainingSlots = 20 - queue.length;
                const toAdd = paths.slice(0, remainingSlots).map(path => ({
                    id: Math.random().toString(36).substr(2, 9),
                    path,
                    status: 'pending' as const
                }));

                if (paths.length > remainingSlots) {
                    alert(`Queue limit (20) reached. Only added ${remainingSlots} files.`);
                }

                setQueue(prev => [...prev, ...toAdd]);
            }
        } catch (e) {
            console.error(e);
        }
    }

    const processQueue = async () => {
        setIsProcessing(true);

        for (let i = 0; i < queue.length; i++) {
            if (queue[i].status === 'done') continue;

            setQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'processing' } : item));
            setProgress(0);

            try {
                let file: SubtitleFile;
                let originalPath = queue[i].path;

                // 1. Parsing / Extraction
                if (originalPath.toLowerCase().endsWith('.mkv')) {
                    // Auto-select first track
                    const tracks = await invoke<any[]>('scan_subtitle_tracks_command', { videoPath: originalPath });
                    if (tracks.length === 0) throw new Error("No subtitle tracks found in MKV");

                    // Extract first track
                    file = await invoke<SubtitleFile>('extract_subtitle_command', {
                        videoPath: originalPath,
                        trackIndex: tracks[0].index
                    });
                } else {
                    file = await invoke<SubtitleFile>('open_subtitle_command', { path: originalPath });
                }

                const rows = [...file.events];
                const totalLines = rows.length;
                const batchSize = 12;

                // 2. Translation Loop
                let currentBatch = 0;
                // Prepare glossary payload
                const glossaryPayload = glossary.map(g => [g.original, g.translated]);

                for (let j = 0; j < totalLines; j += batchSize) {
                    const batchIndices = Array.from(
                        { length: Math.min(batchSize, totalLines - j) },
                        (_, idx) => j + idx
                    );

                    const batchRichLines = batchIndices.map(idx => ({
                        actor: rows[idx]?.actor || "Narrator",
                        text: rows[idx]?.raw_text || ""
                    })).filter(line => line.text !== "");

                    if (batchRichLines.length === 0) continue;

                    const history = j > 0
                        ? rows.slice(Math.max(0, j - 5), j).map(r => r.text_only).filter(t => t !== "")
                        : null;

                    // Retry Logic
                    let attempt = 0;
                    let success = false;
                    while (attempt < 3 && !success) {
                        try {
                            const result = await invoke<string[]>('translate_batch_command', {
                                lines: batchRichLines,
                                history: history || [],
                                glossary: glossaryPayload.length > 0 ? glossaryPayload : null
                            });

                            if (result.length === batchRichLines.length) {
                                // Apply translations
                                result.forEach((translatedText, idx) => {
                                    const rowIndex = batchIndices[idx];
                                    if (rows[rowIndex]) {
                                        rows[rowIndex].text_only = translatedText;
                                    }
                                });
                                success = true;
                            } else {
                                attempt++;
                                await new Promise(r => setTimeout(r, 1000));
                            }
                        } catch (e) {
                            console.error(`Translation error batch ${currentBatch}:`, e);
                            attempt++;
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    }

                    if (!success) throw new Error(`Failed to translate batch starting at line ${j + 1}`);

                    currentBatch++;
                    setProgress(Math.round((Math.min(currentBatch * batchSize, totalLines) / totalLines) * 100));
                }

                // 3. Export
                let finalName = originalPath.substring(0, originalPath.lastIndexOf('.')) + ".translated.mkv";
                const tempSubPath = `${originalPath}.translated.ass`;

                await invoke('save_subtitle_command', {
                    file: { ...file, events: rows },
                    path: tempSubPath
                });

                // Mux (Always use original MKV as video source if it is MKV, else assume video exists with same name?)
                // If input was .ass, we need video. If input .mkv, use it.
                // Assuming MKV input for batch usually.
                let videoSource = originalPath;
                if (!originalPath.toLowerCase().endsWith('.mkv')) {
                    // Try to find MKV with same name
                    videoSource = originalPath.substring(0, originalPath.lastIndexOf('.')) + ".mkv";
                }

                await invoke('embed_subtitle_command', {
                    videoPath: videoSource,
                    subtitlePath: tempSubPath,
                    outputPath: finalName
                });

                setQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'done' } : item));
            } catch (e) {
                console.error(e);
                setQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'error', error: String(e) } : item));
            }
        }

        setIsProcessing(false);
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] border-accent/20 bg-card/95 backdrop-blur-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold text-accent">
                        <Layers className="w-5 h-5" />
                        Fila de Processamento em Lote
                    </DialogTitle>
                    <DialogDescription>
                        Processe até 20 episódios sequencialmente. Otimizado para não sobrecarregar o hardware.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-4 min-h-[300px]">
                    <div className="flex justify-between items-center bg-muted/30 p-3 rounded-lg border border-border/50">
                        <span className="text-sm font-mono text-muted-foreground">
                            {queue.length} / 20 arquivos
                        </span>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setQueue([])} disabled={isProcessing}>
                                Limpar
                            </Button>
                            <Button variant="secondary" size="sm" onClick={handleAddFiles} disabled={isProcessing || queue.length >= 20}>
                                + Adicionar Arquivos
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 border rounded-md overflow-hidden bg-background/50">
                        <div className="flex flex-col divide-y divide-border/50 h-[300px] overflow-y-auto">
                            {queue.map((item, idx) => (
                                <div key={item.id} className="flex items-center gap-3 p-3 text-sm hover:bg-muted/20 transition-colors">
                                    <div className="w-6 text-center text-muted-foreground font-mono text-xs">{idx + 1}</div>
                                    <FileVideo className="w-4 h-4 text-primary/70" />
                                    <div className="flex-1 truncate font-medium flex flex-col">
                                        <span>{item.path.split(/[/\\]/).pop()}</span>
                                        {item.status === 'processing' && (
                                            <Progress value={progress} className="h-1 mt-1" />
                                        )}
                                    </div>
                                    <div className="w-24 flex justify-end">
                                        {item.status === 'pending' && <span className="text-muted-foreground text-xs">Pendente</span>}
                                        {item.status === 'processing' && <span className="text-accent text-xs animate-pulse flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Processando</span>}
                                        {item.status === 'done' && <span className="text-green-500 text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Concluído</span>}
                                        {item.status === 'error' && <span className="text-red-500 text-xs flex items-center gap-1" title={item.error}><AlertCircle className="w-3 h-3" /> Erro</span>}
                                    </div>
                                    {!isProcessing && (
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/50 hover:text-destructive" onClick={() => setQueue(q => q.filter(i => i.id !== item.id))}>
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                            {queue.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-2">
                                    <Layers className="w-8 h-8" />
                                    <p>A fila está vazia</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isProcessing}>
                        Fechar
                    </Button>
                    <Button onClick={processQueue} disabled={queue.length === 0 || isProcessing} className="gap-2 bg-accent hover:bg-accent/90">
                        <Play className="w-4 h-4" /> Iniciar Processamento
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
