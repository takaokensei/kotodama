import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function Logo({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
    return (
        <div className={cn("flex items-center gap-2 select-none", className)}>
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-primary/20 text-primary ring-1 ring-primary/50 shadow-[0_0_15px_-3px_hsl(var(--primary)/0.5)]">
                <span className="text-lg font-bold">言</span>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-background rounded-full flex items-center justify-center border border-border">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
                </div>
            </div>
            {!collapsed && (
                <div className="flex flex-col">
                    <span className="font-bold text-lg leading-none tracking-tight text-foreground">
                        KOTODAMA
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
                        Spirit of Word
                    </span>
                </div>
            )}
        </div>
    );
}

export function LoadingScreen() {
    const [visible, setVisible] = useState(true);
    const [fading, setFading] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setFading(true), 1500); // Start fade out
        const remove = setTimeout(() => setVisible(false), 2000); // Remove from DOM
        return () => { clearTimeout(timer); clearTimeout(remove); };
    }, []);

    if (!visible) return null;

    return (
        <div className={cn(
            "fixed inset-0 z-50 flex flex-col items-center justify-center bg-background transition-opacity duration-500",
            fading ? "opacity-0 pointer-events-none" : "opacity-100"
        )}>
            <div className="scale-150 animate-bounce duration-[2000ms]">
                <Logo />
            </div>
            <div className="mt-8 flex flex-col items-center gap-2">
                <div className="h-1 w-32 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary animate-[translateX_1s_ease-in-out_infinite] w-1/3 rounded-full" />
                </div>
                <span className="text-xs text-muted-foreground font-mono animate-pulse">
                    INITIALIZING SYSTEM...
                </span>
            </div>
        </div>
    );
}
