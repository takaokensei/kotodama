export interface SubtitleEvent {
    index: number;
    start_ms: number;
    end_ms: number;
    text_only: string;
    style_tags: string;
    original_text: string;
}

export enum SubtitleFormat {
    Srt = 'Srt',
    Ass = 'Ass',
}

export interface SubtitleFile {
    events: SubtitleEvent[];
    format: SubtitleFormat;
    header: string | null;
}
