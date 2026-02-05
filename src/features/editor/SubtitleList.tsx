import { useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SubtitleEvent, SubtitleFile, SubtitleTrack, SubtitleFormat } from '@/lib/types'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Play, FileVideo, FileText, Globe, MessageSquare, X, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/Branding"

export function SubtitleList() {
    const parentRef = useRef<HTMLDivElement>(null)

    const [rows, setRows] = useState<SubtitleEvent[]>([])
    const [isTranslating, setIsTranslating] = useState(false)
    const [currentFile, setCurrentFile] = useState<string | null>(null)
    const [originalVideoPath, setOriginalVideoPath] = useState<string | null>(null)

    const [tracks, setTracks] = useState<SubtitleTrack[]>([])
    const [showTrackSelection, setShowTrackSelection] = useState(false)
    const [pendingPath, setPendingPath] = useState<string | null>(null)

    const [translationProgress, setTranslationProgress] = useState(0)
    const [translatedLines, setTranslatedLines] = useState(0)
    const [isCancelling, setIsCancelling] = useState(false)

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 64, // approximate height in px
        overscan: 5,
    })

    const handleTranslateAll = async () => {
        if (isTranslating || rows.length === 0) return;

        setIsTranslating(true);
        setIsCancelling(false);
        setTranslatedLines(0);
        setTranslationProgress(0);

        const totalLines = rows.length;
        const batchSize = 25;
        const totalBatches = Math.ceil(totalLines / batchSize);
        let currentBatch = 0;

        try {
            for (let i = 0; i < totalLines; i += batchSize) {
                if (isCancelling) {
                    console.log("Translation cancelled by user");
                    break;
                }

                const batchIndices = Array.from(
                    { length: Math.min(batchSize, totalLines - i) },
                    (_, idx) => i + idx
                );
                const batchTexts = batchIndices
                    .map(idx => rows[idx]?.raw_text || "")
                    .filter(t => t !== "");

                if (batchTexts.length === 0) continue;

                console.log(`Batch ${currentBatch + 1}/${totalBatches}:`, batchTexts.length, "lines");

                try {
                    const result = await invoke<string[]>('translate_batch_command', { lines: batchTexts });

                    // Update rows
                    setRows(prev => {
                        const newRows = [...prev];
                        result.forEach((translatedText, idx) => {
                            const rowIndex = batchIndices[idx];
                            if (newRows[rowIndex]) {
                                newRows[rowIndex] = {
                                    ...newRows[rowIndex],
                                    text_only: translatedText
                                };
                            }
                        });
                        return newRows;
                    });

                    // Update progress
                    currentBatch++;
                    const linesTranslated = Math.min((currentBatch * batchSize), totalLines);
                    setTranslatedLines(linesTranslated);
                    setTranslationProgress(Math.round((linesTranslated / totalLines) * 100));

                } catch (e) {
                    console.error(`Batch ${currentBatch + 1} failed:`, e);
                    // Continue with next batch despite error
                }
            }

            if (!isCancelling) {
                console.log("Translation complete!");
            }
        } finally {
            setIsTranslating(false);
            setIsCancelling(false);
        }
    }

    const handleCancelTranslation = () => {
        setIsCancelling(true);
    }

    const handleExportToMKV = async () => {
        if (!originalVideoPath || rows.length === 0) {
            alert("No video loaded or no subtitles to export");
            return;
        }

        try {
            // 1. Save current subtitles to temp file
            const tempSubPath = `${originalVideoPath}.translated.ass`;
            const subtitleFile: SubtitleFile = {
                events: rows,
                format: SubtitleFormat.Ass,
                header: ""
            };

            await invoke('save_subtitle_command', {
                file: subtitleFile,
                path: tempSubPath
            });

            // 2. Generate output path
            const outputPath = originalVideoPath.replace(/\.mkv$/i, '.translated.mkv');

            // 3. Embed subtitles
            console.log("Muxing subtitles into:", outputPath);
            await invoke<string>('embed_subtitle_command', {
                videoPath: originalVideoPath,
                subtitlePath: tempSubPath,
                outputPath: outputPath,
                language: "por",
                title: "Portuguese (Translated)"
            });

            alert(`Export successful!\nOutput: ${outputPath}`);
        } catch (e) {
            console.error("Export failed:", e);
            alert("Export Failed: " + e);
        }
    }

    const handleLoadTestFile = async () => {
        try {
            // Hardcoded path for testing as requested
            const path = "C:\\Kotodama\\kotodama\\hitoribocchi 01.ass";
            const file = await invoke<SubtitleFile>('open_subtitle_command', { path });
            console.log("File parsed:", file);
            setRows(file.events);
            setCurrentFile("hitoribocchi 01.ass");
        } catch (e) {
            console.error("Failed to load file:", e);
            alert("Failed to load file. Check console.");
        }
    }

    const handleImportVideo = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Video',
                    extensions: ['mkv', 'mp4', 'webm']
                }]
            });

            if (!selected || typeof selected !== 'string') return;
            const path = selected;

            console.log("Scanning:", path);
            const scannedTracks = await invoke<SubtitleTrack[]>('scan_subtitle_tracks_command', { videoPath: path });
            console.log("Tracks:", scannedTracks);

            if (scannedTracks.length === 0) {
                alert("No subtitle tracks found in this video.");
                return;
            }

            if (scannedTracks.length === 1) {
                await confirmExtraction(path, scannedTracks[0].index);
            } else {
                setTracks(scannedTracks);
                setPendingPath(path);
                setShowTrackSelection(true);
            }

        } catch (e) {
            console.error("Import failed:", e);
            alert("Import Failed: " + e);
        }
    }

    const confirmExtraction = async (path: string, trackIndex: number) => {
        try {
            console.log(`Extracting track ${trackIndex} from ${path}`);
            setShowTrackSelection(false); // Close dialog if open

            const file = await invoke<SubtitleFile>('extract_subtitle_command', {
                videoPath: path,
                trackIndex: trackIndex
            });

            console.log("Extracted & Parsed:", file);
            setRows(file.events);
            setCurrentFile(path.split(/[\\/]/).pop() || path);
            setOriginalVideoPath(path); // Store original video path for export
        } catch (e) {
            console.error("Extraction failed:", e);
            alert("Extraction Failed: " + e);
        }
    }



    return (
        <div className="flex flex-col h-screen bg-background text-foreground font-sans">
            {/* Header */}
            <div className="h-14 border-b flex items-center px-4 justify-between bg-card">
                <div className="flex items-center gap-3">
                    <Logo />

                    <div className="h-6 w-px bg-border mx-3" />

                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleLoadTestFile}
                        className="gap-2"
                    >
                        <FileText className="w-4 h-4" />
                        {currentFile ? `File: ${currentFile}` : 'Load Test File'}
                    </Button>

                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleImportVideo}
                        className="gap-2 border-primary/20 text-primary hover:bg-primary/10"
                    >
                        <FileVideo className="w-4 h-4" />
                        Import Video (MKV)
                    </Button>

                    <div className="h-6 w-px bg-border mx-1" />

                    <Button
                        variant="default"
                        size="sm"
                        onClick={handleTranslateAll}
                        disabled={isTranslating || rows.length === 0}
                        className="gap-2"
                    >
                        {isTranslating ? (
                            <>
                                <Globe className="w-4 h-4 animate-spin" /> Translating...
                            </>
                        ) : (
                            <>
                                <Play className="w-4 h-4" /> Translate All
                            </>
                        )}
                    </Button>

                    {isTranslating && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancelTranslation}
                            className="gap-2 border-destructive/50 text-destructive hover:bg-destructive/10"
                        >
                            <X className="w-4 h-4" /> Cancel
                        </Button>
                    )}

                    <div className="h-6 w-px bg-border mx-1" />

                    <Button
                        variant="default"
                        size="sm"
                        onClick={handleExportToMKV}
                        disabled={!originalVideoPath || rows.length === 0}
                        className="gap-2 bg-accent hover:bg-accent/90"
                    >
                        <Download className="w-4 h-4" /> Export to MKV
                    </Button>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                    {rows.length} Events
                </div>
            </div>

            {/* Progress Bar */}
            {isTranslating && (
                <div className="px-4 py-3 bg-card border-b border-border">
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <Progress value={translationProgress} className="h-2" />
                        </div>
                        <div className="text-xs font-mono text-muted-foreground min-w-[180px] text-right">
                            {translatedLines} / {rows.length} lines ({translationProgress}%)
                        </div>
                    </div>
                </div>
            )}

            {/* Grid Headers */}
            <div className="flex bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 border-b">
                <div className="w-16 text-center">#</div>
                <div className="flex-1 px-4">Source (EN)</div>
                <div className="flex-1 px-4">Target (PT-BR)</div>
                <div className="w-16 text-center">Status</div>
            </div>

            {/* Virtual Scroll Area */}
            <div
                ref={parentRef}
                className="flex-1 w-full overflow-auto"
            >
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const row = rows[virtualRow.index]
                        if (!row) return null; // Safety check

                        return (
                            <div
                                key={virtualRow.key}
                                data-index={virtualRow.index}
                                ref={rowVirtualizer.measureElement}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                                className={cn(
                                    "flex border-b border-border items-start min-h-[64px] transition-colors",
                                    "hover:bg-muted/30"
                                )}
                            >
                                {/* Index */}
                                <div className="w-16 py-3 text-xs text-muted-foreground text-center font-mono select-none">
                                    {row.index}
                                </div>

                                {/* Source */}
                                <div className="flex-1 py-3 px-4 text-sm opacity-80 border-r border-border break-words font-mono whitespace-pre-wrap">
                                    {row.raw_text}
                                </div>

                                {/* Target */}
                                <div className="flex-1 py-3 px-4 text-sm text-foreground">
                                    <textarea
                                        className="w-full bg-transparent outline-none focus:ring-1 focus:ring-primary rounded p-1 resize-none overflow-hidden placeholder:text-muted-foreground/50"
                                        rows={1}
                                        placeholder="Translation..."
                                        value={row.text_only} // Controlled input
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setRows(prev => {
                                                const newRows = [...prev];
                                                newRows[virtualRow.index] = { ...newRows[virtualRow.index], text_only: val };
                                                return newRows;
                                            })
                                        }}
                                    />
                                </div>

                                {/* Status */}
                                <div className="w-16 py-3 flex justify-center">
                                    <div className="w-3 h-3 rounded-full bg-destructive/50 ring-1 ring-destructive/20"></div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            <Dialog open={showTrackSelection} onOpenChange={setShowTrackSelection}>
                <DialogContent className="sm:max-w-md border-border bg-card text-card-foreground">
                    <DialogHeader>
                        <DialogTitle>Select Subtitle Track</DialogTitle>
                        <DialogDescription>
                            Multiple subtitles found. Please choose one to import.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-2 py-4">
                        {tracks.map((track) => (
                            <Button
                                key={track.index}
                                variant="outline"
                                className="justify-start gap-4 h-auto py-3 border-border hover:bg-muted/50"
                                onClick={() => pendingPath && confirmExtraction(pendingPath, track.index)}
                            >
                                <MessageSquare className="w-5 h-5 text-primary" />
                                <div className="flex flex-col items-start gap-0.5">
                                    <div className="font-semibold text-sm">
                                        Track {track.index}
                                        {track.title && <span className="text-muted-foreground ml-2">({track.title})</span>}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {track.language || "Unknown Language"} • {track.codec_name.toUpperCase()}
                                    </div>
                                </div>
                            </Button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div >
    )
}
