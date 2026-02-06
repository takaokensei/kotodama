import { useRef, useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SubtitleEvent, SubtitleFile, SubtitleTrack, SubtitleFormat } from '@/lib/types'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Play, FileVideo, FileText, Globe, MessageSquare, X, Download, ListFilter, ChevronDown, Search, Replace, ChevronUp, CaseSensitive, Book, Plus, Trash2, Save, FolderOpen, Clock, Settings2, Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/Branding"
import { SettingsDialog } from "@/components/SettingsDialog"
import { BatchQueue } from "@/features/batch/BatchQueue"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"

interface GlossaryItem {
    id: string;
    original: string;
    translated: string;
}

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
    const [totalLinesToTranslate, setTotalLinesToTranslate] = useState(0)
    const [isCancelling, setIsCancelling] = useState(false)
    const [hasTranslations, setHasTranslations] = useState(false)

    // Time estimation state
    const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null)

    // Range selection state
    const [showRangeSelector, setShowRangeSelector] = useState(false)
    const [rangeMode, setRangeMode] = useState<'index' | 'time'>('index')
    const [rangeStart, setRangeStart] = useState('1')
    const [rangeEnd, setRangeEnd] = useState('25')

    // Export Modal state
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportFileName, setExportFileName] = useState("");
    const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
    const [exportResultPath, setExportResultPath] = useState("");
    const [exportError, setExportError] = useState("");

    // Search & Replace state
    const [showSearch, setShowSearch] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [replaceQuery, setReplaceQuery] = useState('')
    const [isCaseSensitive, setIsCaseSensitive] = useState(false)
    const [searchMatches, setSearchMatches] = useState<number[]>([])
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)

    // Glossary state
    const [glossary, setGlossary] = useState<GlossaryItem[]>([])
    const [newTerm, setNewTerm] = useState('')
    const [newTranslation, setNewTranslation] = useState('')

    const [showSettings, setShowSettings] = useState(false)
    const [showBatchQueue, setShowBatchQueue] = useState(false)

    const translateWithRetry = async (richLines: any[], history: any[], glossaryItems: GlossaryItem[], maxRetries = 3): Promise<string[]> => {
        let attempt = 0;
        const glossaryPayload = glossaryItems.map(g => [g.original, g.translated]);
        while (attempt < maxRetries) {
            try {
                const result = await invoke<string[]>('translate_batch_command', {
                    lines: richLines,
                    history: history,
                    glossary: glossaryPayload.length > 0 ? glossaryPayload : null
                });

                if (result.length === richLines.length) {
                    return result;
                }
                console.warn(`Attempt ${attempt + 1}: Line count mismatch. Expected ${richLines.length}, got ${result.length}. Retrying...`);
            } catch (err) {
                console.error(`Attempt ${attempt + 1}: Translation error:`, err);
            }
            attempt++;
        }
        throw new Error(`Failed to translate batch after ${maxRetries} attempts.`);
    };

    // Search & Replace logic
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault()
                setShowSearch(prev => !prev)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    useEffect(() => {
        if (!searchQuery) {
            setSearchMatches([])
            setCurrentMatchIndex(-1)
            return
        }

        const matches: number[] = []
        const query = isCaseSensitive ? searchQuery : searchQuery.toLowerCase()

        rows.forEach((row, idx) => {
            const textSource = isCaseSensitive ? row.raw_text : row.raw_text.toLowerCase()
            const textTarget = isCaseSensitive ? row.text_only : row.text_only.toLowerCase()

            if (textSource.includes(query) || textTarget.includes(query)) {
                matches.push(idx)
            }
        })

        setSearchMatches(matches)
        setCurrentMatchIndex(matches.length > 0 ? 0 : -1)
    }, [searchQuery, isCaseSensitive, rows])

    const handleReplaceAll = () => {
        if (!searchQuery) return

        setRows(prev => prev.map(row => {
            // Using regex for global replace with case sensitivity support
            const escapedSearch = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedSearch, isCaseSensitive ? 'g' : 'gi')
            return {
                ...row,
                text_only: row.text_only.replace(regex, replaceQuery)
            }
        }))
        setHasTranslations(true)
    }

    const scrollToMatch = (index: number) => {
        if (index >= 0 && index < searchMatches.length) {
            const rowIndex = searchMatches[index]
            rowVirtualizer.scrollToIndex(rowIndex, { align: 'center' })
            setCurrentMatchIndex(index)
        }
    }

    // Glossary Persistence
    useEffect(() => {
        const saved = localStorage.getItem('kotodama_glossary')
        if (saved) {
            try {
                setGlossary(JSON.parse(saved))
            } catch (e) {
                console.error("Failed to load glossary:", e)
            }
        }
    }, [])

    useEffect(() => {
        localStorage.setItem('kotodama_glossary', JSON.stringify(glossary))
    }, [glossary])

    const handleAddGlossaryTerm = () => {
        if (!newTerm || !newTranslation) return
        const newItem: GlossaryItem = {
            id: Math.random().toString(36).substr(2, 9),
            original: newTerm,
            translated: newTranslation
        }
        setGlossary(prev => [...prev, newItem])
        setNewTerm('')
        setNewTranslation('')
    }

    const handleRemoveGlossaryTerm = (id: string) => {
        setGlossary(prev => prev.filter(item => item.id !== id))
    }

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
        const batchSize = 12;
        const totalBatches = Math.ceil(totalLines / batchSize);
        let currentBatch = 0;
        const startTime = performance.now();

        try {
            for (let i = 0; i < totalLines; i += batchSize) {
                if (isCancelling) break;

                const batchIndices = Array.from(
                    { length: Math.min(batchSize, totalLines - i) },
                    (_, idx) => i + idx
                );

                const batchRichLines = batchIndices
                    .map(idx => ({
                        actor: rows[idx]?.actor || "Narrator",
                        text: rows[idx]?.raw_text || ""
                    }))
                    .filter(line => line.text !== "");

                if (batchRichLines.length === 0) continue;

                const history = i > 0
                    ? rows.slice(Math.max(0, i - 5), i)
                        .map(r => r.text_only)
                        .filter(t => t !== "")
                    : null;

                console.log(`Batch ${currentBatch + 1}/${totalBatches}:`, batchRichLines.length, "lines");

                try {
                    const result = await translateWithRetry(batchRichLines, history || [], glossary);

                    setRows(prev => {
                        const newRows = [...prev];
                        result.forEach((translatedText, idx) => {
                            const rowIndex = batchIndices[idx];
                            if (newRows[rowIndex]) {
                                newRows[rowIndex] = {
                                    ...newRows[rowIndex],
                                    text_only: translatedText,
                                    status: 'translated'
                                };
                            }
                        });
                        return newRows;
                    });

                    currentBatch++;
                    const linesTranslated = Math.min((currentBatch * batchSize), totalLines);
                    setTranslatedLines(linesTranslated);
                    setTranslationProgress(Math.round((linesTranslated / totalLines) * 100));

                    const elapsed = performance.now() - startTime;
                    const msPerLine = elapsed / linesTranslated;
                    const remainingLines = totalLines - linesTranslated;
                    setEstimatedTimeRemaining(Math.round((msPerLine * remainingLines) / 1000));
                } catch (e) {
                    console.error(`Batch ${currentBatch + 1} failed:`, e);
                }
            }

            if (!isCancelling) {
                console.log("Translation complete!");
                setHasTranslations(true);
            }
        } finally {
            setIsTranslating(false);
            setIsCancelling(false);
            setEstimatedTimeRemaining(null);
        }
    }

    const handleCancelTranslation = () => {
        setIsCancelling(true);
    }

    // Helper: Parse time string (HH:MM:SS or MM:SS) to milliseconds
    const parseTimeToMs = (time: string): number => {
        const parts = time.split(':').map(Number);
        if (parts.length === 3) {
            return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
        } else if (parts.length === 2) {
            return (parts[0] * 60 + parts[1]) * 1000;
        }
        return 0;
    }

    // Helper: Get selected range indices
    const getSelectedRange = (): [number, number] | null => {
        if (!rangeStart || !rangeEnd) return null;

        if (rangeMode === 'index') {
            const start = parseInt(rangeStart) - 1; // 1-indexed to 0-indexed
            const end = parseInt(rangeEnd);
            if (isNaN(start) || isNaN(end) || start < 0 || end > rows.length || start >= end) {
                return null;
            }
            return [start, end];
        } else {
            // Time mode
            const startMs = parseTimeToMs(rangeStart);
            const endMs = parseTimeToMs(rangeEnd);
            if (startMs >= endMs) return null;

            const startIdx = rows.findIndex(r => r.start_ms >= startMs);
            const endIdx = rows.findIndex(r => r.end_ms > endMs);

            if (startIdx === -1) return null;
            const finalEndIdx = endIdx === -1 ? rows.length : endIdx;

            if (startIdx >= finalEndIdx) return null;
            return [startIdx, finalEndIdx];
        }
    }

    // Get selected line count for preview
    const selectedLineCount = (() => {
        const range = getSelectedRange();
        return range ? range[1] - range[0] : 0;
    })();

    const handleTranslateRange = async () => {
        const range = getSelectedRange();
        if (!range || isTranslating) {
            alert("Invalid range selected");
            return;
        }

        const [start, end] = range;
        setIsTranslating(true);
        setIsCancelling(false);
        setTranslatedLines(0);
        setTranslationProgress(0);

        const totalLines = end - start;
        setTotalLinesToTranslate(totalLines);
        const batchSize = 12;
        let currentBatch = 0;
        const startTime = performance.now();

        try {
            while (currentBatch * batchSize < totalLines && !isCancelling) {
                const batchStart = start + (currentBatch * batchSize);
                const batchEnd = Math.min(batchStart + batchSize, end);

                const batchRichLines = rows.slice(batchStart, batchEnd).map(r => ({
                    actor: r.actor || "Narrator",
                    text: r.raw_text
                }));

                const history = batchStart > 0
                    ? rows.slice(Math.max(0, batchStart - 5), batchStart)
                        .map(r => r.text_only)
                        .filter(t => t !== "")
                    : null;

                try {
                    const result = await translateWithRetry(batchRichLines, history || [], glossary);

                    setRows(prevRows => {
                        const newRows = [...prevRows];
                        result.forEach((translatedText, i) => {
                            const rowIndex = batchStart + i;
                            if (rowIndex < newRows.length) {
                                newRows[rowIndex] = {
                                    ...newRows[rowIndex],
                                    text_only: translatedText,
                                    status: 'translated'
                                };
                            }
                        });
                        return newRows;
                    });

                    currentBatch++;
                    const linesTranslated = Math.min((currentBatch * batchSize), totalLines);
                    setTranslatedLines(linesTranslated);
                    setTranslationProgress(Math.round((linesTranslated / totalLines) * 100));

                    // ETA Calculation
                    const elapsed = performance.now() - startTime;
                    const msPerLine = elapsed / linesTranslated;
                    const remainingLines = totalLines - linesTranslated;
                    setEstimatedTimeRemaining(Math.round((msPerLine * remainingLines) / 1000));

                } catch (e) {
                    console.error(`Batch ${currentBatch + 1} failed:`, e);
                }
            }

            if (!isCancelling) {
                console.log("Range translation complete!");
                setHasTranslations(true);
            }
        } finally {
            setIsTranslating(false);
            setIsCancelling(false);
            setEstimatedTimeRemaining(null);
        }
    }

    const formatETA = (seconds: number | null): string => {
        if (seconds === null) return '';
        if (seconds < 0) return 'calculating...';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    const handleSaveProject = async () => {
        if (rows.length === 0) return;

        try {
            const savePath = await invoke<string | null>('plugin:dialog|save', {
                title: 'Save Kotodama Project',
                filters: [{ name: 'Kotodama Project', extensions: ['koto'] }]
            });

            if (!savePath) return;

            const projectData = {
                videoPath: originalVideoPath,
                subPath: currentFile,
                events: rows,
                glossary: glossary,
                version: "1.0"
            };

            await invoke('save_project_command', {
                path: savePath,
                content: JSON.stringify(projectData, null, 2)
            });

            console.log("Project saved to:", savePath);
        } catch (e) {
            console.error("Save failed:", e);
            alert("Save Failed: " + e);
        }
    }

    const handleLoadProject = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'Kotodama Project', extensions: ['koto'] }]
            });

            if (!selected || typeof selected !== 'string') return;

            console.log("Loading project from:", selected);
            const content = await invoke<string>('load_project_command', { path: selected });
            const projectData = JSON.parse(content);

            if (projectData.events) setRows(projectData.events);
            if (projectData.videoPath) setOriginalVideoPath(projectData.videoPath);
            if (projectData.subPath) setCurrentFile(projectData.subPath);
            if (projectData.glossary) setGlossary(projectData.glossary);

            setHasTranslations(true);
            console.log("Project loaded successfully!");
        } catch (e) {
            console.error("Load failed:", e);
            alert("Load Failed: Make sure this is a valid .koto file.");
        }
    }

    const handleExportNative = async () => {
        if (!originalVideoPath || rows.length === 0) return;

        // Determine directory of original video
        const lastSlash = Math.max(originalVideoPath.lastIndexOf('/'), originalVideoPath.lastIndexOf('\\'));
        const videoDir = lastSlash !== -1 ? originalVideoPath.substring(0, lastSlash + 1) : "";

        // Default name if empty
        let finalName = exportFileName.trim();
        if (!finalName) {
            const baseFile = originalVideoPath.substring(lastSlash + 1);
            const lastDot = baseFile.lastIndexOf('.');
            const nameWithoutExt = lastDot !== -1 ? baseFile.substring(0, lastDot) : baseFile;
            finalName = nameWithoutExt + ".translated.mkv";
        }
        if (!finalName.endsWith('.mkv')) finalName += ".mkv";

        // Ensure we have an absolute path if user just provided a filename
        const isAbsolute = /^[a-zA-Z]:\\|^[a-zA-Z]:\/|^\/|^\\\\/.test(finalName);
        const finalAbsolutePath = isAbsolute ? finalName : videoDir + finalName;

        setExportStatus('exporting');
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

            // 2. Mux
            const result = await invoke<string>('embed_subtitle_command', {
                videoPath: originalVideoPath,
                subtitlePath: tempSubPath,
                outputPath: finalAbsolutePath
            });

            console.log("Export Result:", result);
            setExportResultPath(result);
            setExportStatus('success');
        } catch (e) {
            console.error("Export Error:", e);
            setExportError(String(e));
            setExportStatus('error');
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
                        Import MKV
                    </Button>

                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowBatchQueue(true)}
                        className="gap-2 border-accent/20 text-accent hover:bg-accent/10"
                    >
                        <Layers className="w-4 h-4" />
                        Batch
                    </Button>

                    <div className="flex gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleSaveProject}
                            disabled={rows.length === 0}
                            className="gap-1.5"
                            title="Save Project (.koto)"
                        >
                            <Save className="w-4 h-4" />
                            <span className="hidden lg:inline">Save</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLoadProject}
                            className="gap-1.5"
                            title="Load Project (.koto)"
                        >
                            <FolderOpen className="w-4 h-4" />
                            <span className="hidden lg:inline">Load</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowSettings(true)}
                            className="gap-1.5 text-muted-foreground hover:text-accent"
                            title="Configurações"
                        >
                            <Settings2 className="w-4 h-4" />
                        </Button>
                    </div>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSearch(prev => !prev)}
                        className={cn(
                            "gap-2 transition-colors",
                            showSearch && "bg-accent text-accent-foreground"
                        )}
                    >
                        <Search className="w-4 h-4" />
                        Search
                    </Button>

                    <Sheet>
                        <SheetTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="gap-2"
                            >
                                <Book className="w-4 h-4" />
                                Glossary
                                {glossary.length > 0 && (
                                    <Badge variant="secondary" className="ml-1 h-5 min-w-5 flex items-center justify-center px-1">
                                        {glossary.length}
                                    </Badge>
                                )}
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-[400px] sm:w-[540px] bg-card/95 backdrop-blur-xl border-l border-border shadow-2xl">
                            <SheetHeader>
                                <SheetTitle className="flex items-center gap-2 text-primary">
                                    <Book className="w-5 h-5" />
                                    Glossary & Terminology
                                </SheetTitle>
                                <SheetDescription>
                                    Define specific translations for terms. These will be used by the AI to ensure consistency.
                                </SheetDescription>
                            </SheetHeader>

                            <div className="mt-8 space-y-6">
                                {/* Add New Term Form */}
                                <div className="space-y-3 p-4 rounded-xl bg-muted/30 border border-border/50">
                                    <h4 className="text-sm font-medium flex items-center gap-2">
                                        <Plus className="w-4 h-4" /> Add New Term
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="term-original" className="text-[10px] uppercase tracking-wider text-muted-foreground">Source Term</Label>
                                            <Input
                                                id="term-original"
                                                placeholder="e.g. Sword"
                                                value={newTerm}
                                                onChange={(e) => setNewTerm(e.target.value)}
                                                className="h-9 bg-background/50"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="term-translated" className="text-[10px] uppercase tracking-wider text-muted-foreground">Translation</Label>
                                            <Input
                                                id="term-translated"
                                                placeholder="e.g. Espada"
                                                value={newTranslation}
                                                onChange={(e) => setNewTranslation(e.target.value)}
                                                className="h-9 bg-background/50"
                                            />
                                        </div>
                                    </div>
                                    <Button
                                        onClick={handleAddGlossaryTerm}
                                        className="w-full mt-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                                        disabled={!newTerm || !newTranslation}
                                    >
                                        Add to Glossary
                                    </Button>
                                </div>

                                {/* Terms List */}
                                <div className="space-y-3">
                                    <h4 className="text-sm font-medium text-muted-foreground px-1">Active Terms ({glossary.length})</h4>
                                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
                                        {glossary.length === 0 ? (
                                            <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
                                                <Book className="w-8 h-8 text-border mx-auto mb-2" />
                                                <p className="text-sm text-muted-foreground">Your glossary is empty.</p>
                                            </div>
                                        ) : (
                                            glossary.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="group flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-transparent hover:border-border hover:bg-muted/40 transition-all"
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-semibold text-foreground">{item.original}</span>
                                                        <span className="text-xs text-primary/80 font-medium">→ {item.translated}</span>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={() => handleRemoveGlossaryTerm(item.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>

                    <div className="h-6 w-px bg-border mx-1" />

                    {/* Range Selector Toggle */}
                    <Collapsible open={showRangeSelector} onOpenChange={setShowRangeSelector}>
                        <CollapsibleTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                            >
                                <ListFilter className="w-4 h-4" />
                                Select Range
                                <ChevronDown className={cn(
                                    "w-3 h-3 transition-transform",
                                    showRangeSelector && "rotate-180"
                                )} />
                            </Button>
                        </CollapsibleTrigger>
                    </Collapsible>

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
                        size="sm"
                        onClick={() => {
                            if (originalVideoPath) {
                                let defaultName = originalVideoPath.split(/[/\\]/).pop() || "";
                                if (defaultName.includes('.')) {
                                    defaultName = defaultName.substring(0, defaultName.lastIndexOf('.'));
                                }
                                setExportFileName(defaultName + ".translated.mkv");
                            }
                            setShowExportModal(true);
                        }}
                        disabled={!originalVideoPath || rows.length === 0}
                        className={cn(
                            "gap-2 transition-all duration-300",
                            hasTranslations
                                ? "bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/50 ring-2 ring-accent/30"
                                : "bg-muted/30 hover:bg-muted/50 text-muted-foreground"
                        )}
                    >
                        <Download className="w-4 h-4" /> Export to MKV
                    </Button>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                    {rows.length} Events
                </div>
            </div>

            {/* Search & Replace Toolbar */}
            <Collapsible open={showSearch} onOpenChange={setShowSearch}>
                <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2">
                    <div className="px-4 py-2 bg-card/80 backdrop-blur border-b border-border flex items-center gap-4">
                        <div className="flex items-center gap-2 flex-1 max-w-sm">
                            <Search className="w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Find..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-8 py-1 bg-background/50"
                            />
                        </div>

                        <div className="flex items-center gap-1 bg-muted/30 rounded-md px-1 py-0.5">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => scrollToMatch(currentMatchIndex - 1)}
                                disabled={searchMatches.length <= 0}
                            >
                                <ChevronUp className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => scrollToMatch(currentMatchIndex + 1)}
                                disabled={searchMatches.length <= 0}
                            >
                                <ChevronDown className="w-4 h-4" />
                            </Button>
                            <span className="text-[10px] text-muted-foreground font-mono min-w-[60px] text-center">
                                {searchMatches.length > 0 ? `${currentMatchIndex + 1} / ${searchMatches.length}` : 'no results'}
                            </span>
                        </div>

                        <div className="h-6 w-px bg-border mx-1" />

                        <div className="flex items-center gap-2 flex-1 max-w-sm">
                            <Replace className="w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Replace with..."
                                value={replaceQuery}
                                onChange={(e) => setReplaceQuery(e.target.value)}
                                className="h-8 py-1 bg-background/50"
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-3 text-xs border-accent/20 hover:bg-accent/10"
                                onClick={handleReplaceAll}
                                disabled={!searchQuery || searchMatches.length === 0}
                            >
                                Replace All
                            </Button>
                        </div>

                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "h-8 gap-2 text-xs",
                                isCaseSensitive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                            )}
                            onClick={() => setIsCaseSensitive(prev => !prev)}
                        >
                            <CaseSensitive className="w-4 h-4" />
                            Case Sensitive
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 ml-auto text-muted-foreground hover:text-foreground"
                            onClick={() => setShowSearch(false)}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </CollapsibleContent>
            </Collapsible>

            {/* Range Selector Panel */}
            <Collapsible open={showRangeSelector} onOpenChange={setShowRangeSelector}>
                <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2">
                    <div className="px-4 py-3 bg-card/50 backdrop-blur border-b border-border">
                        <Tabs value={rangeMode} onValueChange={(v) => {
                            const newMode = v as 'index' | 'time';
                            setRangeMode(newMode);
                            // Set default values based on mode
                            if (newMode === 'index') {
                                setRangeStart('1');
                                setRangeEnd('25');
                            } else {
                                setRangeStart('00:00:00');
                                setRangeEnd('00:05:00');
                            }
                        }}>
                            <TabsList className="grid w-full max-w-[400px] grid-cols-2">
                                <TabsTrigger value="index">By Index</TabsTrigger>
                                <TabsTrigger value="time">By Time</TabsTrigger>
                            </TabsList>

                            <TabsContent value="index" className="space-y-3 mt-3">
                                <div className="flex items-end gap-3">
                                    <div className="flex-1">
                                        <Label htmlFor="range-start-index" className="text-xs">From (Line #)</Label>
                                        <Input
                                            id="range-start-index"
                                            type="number"
                                            min="1"
                                            max={rows.length}
                                            value={rangeStart}
                                            onChange={(e) => setRangeStart(e.target.value)}
                                            placeholder="1"
                                            className="mt-1"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <Label htmlFor="range-end-index" className="text-xs">To (Line #)</Label>
                                        <Input
                                            id="range-end-index"
                                            type="number"
                                            min="1"
                                            max={rows.length}
                                            value={rangeEnd}
                                            onChange={(e) => setRangeEnd(e.target.value)}
                                            placeholder={rows.length.toString()}
                                            className="mt-1"
                                        />
                                    </div>
                                    {selectedLineCount > 0 && (
                                        <Badge variant="secondary" className="mb-2 bg-accent/20 text-accent-foreground">
                                            {selectedLineCount} lines
                                        </Badge>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="time" className="space-y-3 mt-3">
                                <div className="flex items-end gap-3">
                                    <div className="flex-1">
                                        <Label htmlFor="range-start-time" className="text-xs">From (HH:MM:SS)</Label>
                                        <Input
                                            id="range-start-time"
                                            type="text"
                                            value={rangeStart}
                                            onChange={(e) => setRangeStart(e.target.value)}
                                            placeholder="00:00:00"
                                            className="mt-1 font-mono"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <Label htmlFor="range-end-time" className="text-xs">To (HH:MM:SS)</Label>
                                        <Input
                                            id="range-end-time"
                                            type="text"
                                            value={rangeEnd}
                                            onChange={(e) => setRangeEnd(e.target.value)}
                                            placeholder="00:05:00"
                                            className="mt-1 font-mono"
                                        />
                                    </div>
                                    {selectedLineCount > 0 && (
                                        <Badge variant="secondary" className="mb-2 bg-accent/20 text-accent-foreground">
                                            {selectedLineCount} lines
                                        </Badge>
                                    )}
                                </div>
                            </TabsContent>
                        </Tabs>

                        <div className="flex gap-2 mt-3">
                            <Button
                                size="sm"
                                onClick={handleTranslateRange}
                                disabled={selectedLineCount === 0 || isTranslating}
                                className="gap-2"
                            >
                                <Play className="w-3 h-3" />
                                Translate Range
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    setRangeStart('');
                                    setRangeEnd('');
                                }}
                            >
                                Clear
                            </Button>
                        </div>
                    </div>
                </CollapsibleContent>
            </Collapsible>

            {/* Progress Bar */}
            {isTranslating && (
                <div className="px-4 py-3 bg-card border-b border-border">
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-mono text-muted-foreground">
                                    {translatedLines} / {totalLinesToTranslate || rows.length} lines ({translationProgress}%)
                                </span>
                                {estimatedTimeRemaining !== null && (
                                    <span className="text-lg font-mono text-accent animate-pulse font-bold flex items-center gap-2 bg-accent/10 px-3 py-1 rounded-full border border-accent/20 shadow-[0_0_15px_rgba(122,162,247,0.2)]">
                                        <Clock className="w-5 h-5" />
                                        ETA: {formatETA(estimatedTimeRemaining)}
                                    </span>
                                )}
                            </div>
                            <Progress value={translationProgress} className="h-2" />
                        </div>
                    </div>
                </div>
            )}

            {/* Grid Headers */}
            <div className="flex bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 border-b">
                <div className="w-16 text-center">#</div>
                <div className="w-24 px-2 text-left">Actor</div>
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

                                {/* Actor */}
                                <div className="w-24 py-3 px-2 text-[10px] font-bold text-primary/70 uppercase tracking-tighter truncate border-r border-border/50">
                                    {row.actor || "-"}
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
                                <div className="w-16 py-3 flex justify-center items-center">
                                    <div className={cn(
                                        "w-3 h-3 rounded-full transition-colors",
                                        row.status === 'translated' ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" :
                                            row.status === 'error' ? "bg-red-500" :
                                                "bg-muted-foreground/20"
                                    )} title={row.status || 'original'} />
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
            {/* Custom Export Modal */}
            <Dialog open={showExportModal} onOpenChange={(open) => {
                if (!open && exportStatus === 'exporting') return;
                setShowExportModal(open);
                if (!open) {
                    setTimeout(() => {
                        setExportStatus('idle');
                        setExportError("");
                        setExportResultPath("");
                    }, 300);
                }
            }}>
                <DialogContent className="sm:max-w-[500px] border-border bg-card/95 backdrop-blur-xl text-card-foreground shadow-2xl p-0 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />

                    <div className="relative p-6">
                        <DialogHeader className="mb-6">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                                <Download className="w-6 h-6 text-primary" />
                            </div>
                            <DialogTitle className="text-2xl font-bold tracking-tight">Export Video</DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                                Muxing translated subtitles into a new MKV container.
                            </DialogDescription>
                        </DialogHeader>

                        {exportStatus === 'idle' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-2">
                                    <Label htmlFor="export-name" className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
                                        Output Filename
                                    </Label>
                                    <div className="relative group">
                                        <Input
                                            id="export-name"
                                            value={exportFileName}
                                            onChange={(e) => setExportFileName(e.target.value)}
                                            placeholder="video_name.translated.mkv"
                                            className="pr-12 bg-muted/30 border-primary/20 focus-visible:ring-primary h-12 text-sm font-medium"
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px] font-mono select-none">
                                            .mkv
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground italic px-1">
                                        Tip: Leave empty to use original name + ".translated"
                                    </p>
                                </div>

                                <div className="pt-4 flex gap-3">
                                    <Button
                                        variant="outline"
                                        className="flex-1 border-primary/10 hover:bg-muted/50"
                                        onClick={() => setShowExportModal(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 gap-2"
                                        onClick={handleExportNative}
                                    >
                                        <Download className="w-4 h-4" />
                                        Start Muxing
                                    </Button>
                                </div>
                            </div>
                        )}

                        {exportStatus === 'exporting' && (
                            <div className="py-12 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500">
                                <div className="relative w-20 h-20 mb-6">
                                    <div className="absolute inset-0 rounded-full border-4 border-primary/10 border-t-primary animate-spin" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <FileVideo className="w-8 h-8 text-primary/40" />
                                    </div>
                                </div>
                                <h3 className="text-lg font-bold mb-1">Muxing Subtitles...</h3>
                                <p className="text-sm text-muted-foreground animate-pulse">Running FFmpeg in the background</p>
                            </div>
                        )}

                        {exportStatus === 'success' && (
                            <div className="py-6 space-y-4 animate-in fade-in zoom-in-95 duration-500">
                                <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-2">
                                    <div className="relative w-full h-full flex items-center justify-center">
                                        <div className="w-8 h-8 rounded-full bg-green-500 animate-ping absolute" />
                                        <Play className="w-8 h-8 text-green-500 relative" />
                                    </div>
                                </div>
                                <div className="text-center">
                                    <h3 className="text-xl font-bold text-green-400">Export Successful!</h3>
                                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2 bg-muted/30 p-2 rounded text-xs font-mono break-all">
                                        {exportResultPath}
                                    </p>
                                </div>
                                <Button
                                    className="w-full mt-4"
                                    onClick={() => setShowExportModal(false)}
                                >
                                    Dismiss
                                </Button>
                            </div>
                        )}

                        {exportStatus === 'error' && (
                            <div className="py-6 space-y-4 animate-in fade-in zoom-in-95 duration-500">
                                <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto mb-2">
                                    <X className="w-8 h-8 text-destructive" />
                                </div>
                                <div className="text-center">
                                    <h3 className="text-xl font-bold text-destructive">Muxing Failed</h3>
                                    <p className="text-sm text-destructive/80 mt-2 bg-destructive/5 p-2 rounded text-xs font-mono">
                                        {exportError}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full mt-4 border-destructive/20 hover:bg-destructive/10"
                                    onClick={() => setExportStatus('idle')}
                                >
                                    Try Again
                                </Button>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
            <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
            <BatchQueue open={showBatchQueue} onOpenChange={setShowBatchQueue} glossary={glossary} />
        </div >
    )
}
