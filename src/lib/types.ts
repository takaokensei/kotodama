export interface SubtitleEvent {
    index: number;
    start_ms: number;
    end_ms: number;
    text_only: string;
    raw_text: string; // Changed from original_text/style_tags to raw_text
}

export enum SubtitleFormat {
    Srt = 'Srt',
    Ass = 'Ass',
}

export interface SubtitleFile {
    events: SubtitleEvent[];
    format: SubtitleFormat;
    header: string;
}
