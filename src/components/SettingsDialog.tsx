import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { invoke } from '@tauri-apps/api/core'
import { Settings2, Save, RotateCcw } from "lucide-react"

interface AppConfig {
    ollama_url: string;
    model_name: string;
    temperature: number;
    context_history_lines: number;
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
    const [config, setConfig] = useState<AppConfig | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (open) {
            loadConfig()
        }
    }, [open])

    const loadConfig = async () => {
        try {
            const cfg = await invoke<AppConfig>('get_config_command')
            setConfig(cfg)
        } catch (e) {
            console.error("Failed to load config:", e)
        }
    }

    const handleSave = async () => {
        if (!config) return
        setLoading(true)
        try {
            await invoke('update_config_command', { config })
            onOpenChange(false)
        } catch (e) {
            console.error("Failed to save config:", e)
            alert("Failed to save settings: " + e)
        } finally {
            setLoading(false)
        }
    }

    const resetToDefaults = () => {
        setConfig({
            ollama_url: "http://localhost:11434/api/generate",
            model_name: "llama3.1:8b",
            temperature: 0.3,
            context_history_lines: 5
        })
    }

    if (!config) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] border-accent/20 bg-card/95 backdrop-blur-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold text-accent">
                        <Settings2 className="w-5 h-5" />
                        Configurações do Motor
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground/80">
                        Ajuste os parâmetros do Ollama e o comportamento da IA.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="url" className="text-sm font-medium">Ollama Endpoint URL</Label>
                        <Input
                            id="url"
                            className="bg-background/50 border-accent/20 focus:border-accent transition-all"
                            value={config.ollama_url}
                            onChange={e => setConfig({ ...config, ollama_url: e.target.value })}
                            placeholder="http://localhost:11434/api/generate"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="model" className="text-sm font-medium">Modelo LLM</Label>
                        <Input
                            id="model"
                            className="bg-background/50 border-accent/20 focus:border-accent transition-all"
                            value={config.model_name}
                            onChange={e => setConfig({ ...config, model_name: e.target.value })}
                            placeholder="llama3.1:8b"
                        />
                    </div>
                    <div className="grid gap-4">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="temp" className="text-sm font-medium">Temperatura (Criatividade)</Label>
                            <span className="text-xs font-mono bg-accent/20 text-accent px-2 py-1 rounded">{config.temperature.toFixed(1)}</span>
                        </div>
                        <input
                            type="range"
                            id="temp"
                            min="0"
                            max="1"
                            step="0.1"
                            value={config.temperature}
                            onChange={e => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-accent"
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground uppercase tracking-wider">
                            <span>Preciso</span>
                            <span>Criativo</span>
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="history" className="text-sm font-medium">Janela de Contexto (Linhas)</Label>
                        <Input
                            id="history"
                            type="number"
                            min="0"
                            max="20"
                            className="bg-background/50 border-accent/20 focus:border-accent transition-all w-24"
                            value={config.context_history_lines}
                            onChange={e => setConfig({ ...config, context_history_lines: parseInt(e.target.value) })}
                        />
                    </div>
                </div>

                <DialogFooter className="flex justify-between sm:justify-between items-center w-full pt-4 border-t border-accent/10">
                    <Button variant="ghost" size="sm" onClick={resetToDefaults} className="gap-2 hover:bg-accent/10 hover:text-accent transition-colors">
                        <RotateCcw className="w-4 h-4" /> Restaurar Padrão
                    </Button>
                    <Button onClick={handleSave} disabled={loading} className="gap-2 bg-accent hover:bg-accent/90 shadow-lg shadow-accent/20">
                        <Save className="w-4 h-4" /> Salvar Alterações
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
