import { useEffect, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"

const SYMBOLS = [
    "∑",
    "Δ",
    "σ",
    "π",
    "μ",
    "λ",
    "∞",
    "∂",
    "α",
    "β",
    "ρ",
    "θ",
    "φ",
    "ε",
    "η",
]

function parseColor(color: string) {
    const tmp = document.createElement("canvas")
    tmp.width = tmp.height = 1
    const c = tmp.getContext("2d")!
    c.fillStyle = color
    c.fillRect(0, 0, 1, 1)
    const [r, g, b] = c.getImageData(0, 0, 1, 1).data
    return { r, g, b }
}

export default function ParticleSymbols({
    count = 120,
    attractRadius = 140,
    attractStrength = 6,
    damping = 0.88,
    returnSpeed = 0.04,
    symbolColor = "#ffffff",
    minSize = 8,
    maxSize = 22,
}) {
    const canvasRef = useRef(null)
    const rawMouseRef = useRef({ x: -9999, y: -9999 })

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext("2d")
        const { r, g, b } = parseColor(symbolColor)
        let animId
        let W, H, dpr
        let particles: { x: number; y: number; hx: number; hy: number; vx: number; vy: number; symbol: string; size: number; base: number }[] = []

        function init() {
            dpr = window.devicePixelRatio || 1
            W = canvas.offsetWidth
            H = canvas.offsetHeight
            canvas.width = W * dpr
            canvas.height = H * dpr
            ctx.scale(dpr, dpr)

            particles = Array.from({ length: count }, () => {
                const x = Math.random() * W
                const y = Math.random() * H
                return {
                    x,
                    y,
                    hx: x,
                    hy: y,
                    vx: 0,
                    vy: 0,
                    symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
                    size: minSize + Math.random() * (maxSize - minSize),
                    base: 0.1 + Math.random() * 0.35,
                }
            })
        }

        function draw() {
            ctx.clearRect(0, 0, W, H)

            // Recompute canvas-relative position every frame so scroll is accounted for
            const rect = canvas.getBoundingClientRect()
            const raw = rawMouseRef.current
            const mx = raw.x < -999 ? -9999 : raw.x - rect.left
            const my = raw.y < -999 ? -9999 : raw.y - rect.top

            for (const p of particles) {
                // home → mouse: determines if this particle is in range
                const hdx = mx - p.hx
                const hdy = my - p.hy
                const homeDist = Math.sqrt(hdx * hdx + hdy * hdy)

                // Spring target: home nudged toward mouse, capped so it never reaches cursor
                let tx = p.hx
                let ty = p.hy
                if (homeDist > 1 && homeDist < attractRadius) {
                    const pull = (attractRadius - homeDist) / attractRadius
                    const maxPull = attractRadius * 0.35 * attractStrength * 0.08
                    const offset = maxPull * pull * pull
                    tx = p.hx + (hdx / homeDist) * offset
                    ty = p.hy + (hdy / homeDist) * offset
                }

                p.vx += (tx - p.x) * returnSpeed
                p.vy += (ty - p.y) * returnSpeed
                p.vx *= damping
                p.vy *= damping
                p.x += p.vx
                p.y += p.vy

                const pull = homeDist < attractRadius ? 1 - homeDist / attractRadius : 0
                const alpha = Math.min(1, p.base + pull * (1 - p.base))

                ctx.font = `${p.size}px monospace`
                ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
                ctx.fillText(p.symbol, p.x, p.y)
            }

            animId = requestAnimationFrame(draw)
        }

        function onMove(e: MouseEvent) {
            rawMouseRef.current = { x: e.clientX, y: e.clientY }
        }
        function onLeave() {
            rawMouseRef.current = { x: -9999, y: -9999 }
        }

        init()
        window.addEventListener("mousemove", onMove)
        canvas.addEventListener("mouseleave", onLeave)
        draw()

        return () => {
            cancelAnimationFrame(animId)
            window.removeEventListener("mousemove", onMove)
            canvas.removeEventListener("mouseleave", onLeave)
        }
    }, [
        count,
        attractRadius,
        attractStrength,
        damping,
        returnSpeed,
        symbolColor,
        minSize,
        maxSize,
    ])

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: "100%",
                height: "100%",
                display: "block",
                pointerEvents: "none",
            }}
        />
    )
}

addPropertyControls(ParticleSymbols, {
    count: {
        type: ControlType.Number,
        defaultValue: 120,
        min: 20,
        max: 400,
        title: "Count",
    },
    attractRadius: {
        type: ControlType.Number,
        defaultValue: 140,
        min: 50,
        max: 400,
        title: "Attract radius",
    },
    attractStrength: {
        type: ControlType.Number,
        defaultValue: 6,
        min: 0.5,
        max: 20,
        step: 0.5,
        title: "Strength",
    },
    damping: {
        type: ControlType.Number,
        defaultValue: 0.88,
        min: 0.5,
        max: 0.99,
        step: 0.01,
        title: "Damping",
    },
    returnSpeed: {
        type: ControlType.Number,
        defaultValue: 0.04,
        min: 0.01,
        max: 0.2,
        step: 0.01,
        title: "Return speed",
    },
    symbolColor: {
        type: ControlType.Color,
        defaultValue: "#ffffff",
        title: "Color",
    },
    minSize: {
        type: ControlType.Number,
        defaultValue: 8,
        min: 4,
        max: 40,
        title: "Min size",
    },
    maxSize: {
        type: ControlType.Number,
        defaultValue: 22,
        min: 8,
        max: 60,
        title: "Max size",
    },
})
