export interface SubtitleEvent {
    index: number;
    start_ms: number;
    end_ms: number;
    actor: string;
    style: string;
    text_only: string;
    raw_text: string;
    status: 'original' | 'translated' | 'error';
}

export enum SubtitleFormat {
    Srt = 'Srt',
    Ass = 'Ass',
}

export interface SubtitleTrack {
    index: number;
    codec_name: string;
    language?: string;
    title?: string;
}

export interface SubtitleFile {
    events: SubtitleEvent[];
    format: SubtitleFormat;
    header: string;
}
