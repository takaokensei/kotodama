import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SubtitleEvent } from '@/lib/types'

// Mock Data for Phase 1 DoD
const createDummyData = (count: number): SubtitleEvent[] => {
    return Array.from({ length: count }, (_, i) => ({
        index: i + 1,
        start_ms: i * 3000,
        end_ms: (i * 3000) + 2500,
        text_only: `Subtitle Line ${i + 1}`,
        style_tags: '',
        original_text: `Subtitle Line ${i + 1} - This is the source text which is read-only.`
    }))
}

export function SubtitleList() {
    const parentRef = useRef<HTMLDivElement>(null)

    const rows = createDummyData(5000)

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 64, // approximate height in px
        overscan: 5,
    })

    return (
        <div className="flex flex-col h-screen bg-[#1a1b26] text-[#a9b1d6] font-sans">
            {/* Header */}
            <div className="h-12 border-b border-gray-800 flex items-center px-4 justify-between bg-[#16161e]">
                <h1 className="font-bold text-lg text-[#7aa2f7]">Kotodama Workspace</h1>
                <div className="text-xs text-gray-500">DoD Phase 1: Virtual List (5k lines)</div>
            </div>

            {/* Grid Headers */}
            <div className="flex bg-[#1f2335] text-xs font-bold uppercase tracking-wider text-gray-400 py-2 border-b border-gray-700">
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
                                className="flex border-b border-gray-800/50 hover:bg-[#1f2335]/50 transition-colors items-start min-h-[64px]"
                            >
                                {/* Index */}
                                <div className="w-16 py-3 text-xs text-gray-500 text-center font-mono select-none">
                                    {row.index}
                                </div>

                                {/* Source */}
                                <div className="flex-1 py-3 px-4 text-sm opacity-70 border-r border-gray-800/50 break-words">
                                    {row.original_text}
                                </div>

                                {/* Target */}
                                <div className="flex-1 py-3 px-4 text-sm text-white">
                                    <textarea
                                        className="w-full bg-transparent outline-none focus:ring-1 focus:ring-[#7aa2f7] rounded p-1 resize-none overflow-hidden"
                                        rows={1}
                                        placeholder="Translation..."
                                        defaultValue=""
                                    />
                                </div>

                                {/* Status */}
                                <div className="w-16 py-3 flex justify-center">
                                    <div className="w-3 h-3 rounded-full bg-red-500/50 ring-1 ring-red-500/20"></div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
