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

function resolveColor(color: string) {
    const div = document.createElement("div")
    div.style.color = color
    div.style.position = "absolute"
    div.style.visibility = "hidden"
    document.body.appendChild(div)
    const computed = getComputedStyle(div).color
    document.body.removeChild(div)
    const m = computed.match(/[\d.]+/g) ?? ["255", "255", "255"]
    return { r: +m[0], g: +m[1], b: +m[2] }
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
    driftAmplitude = 8,
    driftSpeed = 0.002,
}) {
    const canvasRef = useRef(null)
    const rawMouseRef = useRef({ x: -9999, y: -9999 })
    const colorRef = useRef({ r: 255, g: 255, b: 255 })

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext("2d")

        function refreshColor() {
            colorRef.current = resolveColor(symbolColor)
        }
        refreshColor()

        // re-resolve when Framer switches dark/light mode (changes class on <html>)
        const observer = new MutationObserver(refreshColor)
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-framer-theme", "data-theme"] })

        let animId: number
        let W: number, H: number, dpr: number
        type Particle = {
            hx: number; hy: number; x: number; y: number; vx: number; vy: number
            symbol: string; size: number; base: number
            a1: number; r1: number; amp1: number; ph1: number
            a2: number; r2: number; amp2: number; ph2: number
        }
        let particles: Particle[] = []

        function init() {
            dpr = window.devicePixelRatio || 1
            W = canvas.offsetWidth
            H = canvas.offsetHeight
            canvas.width = W * dpr
            canvas.height = H * dpr
            ctx.scale(dpr, dpr)

            particles = Array.from({ length: count }, () => {
                const hx = Math.random() * W
                const hy = Math.random() * H
                const amp = driftAmplitude * (0.4 + Math.random() * 0.8)
                const a1 = Math.random() * Math.PI * 2
                const a2 = Math.random() * Math.PI * 2
                const ph1 = Math.random() * Math.PI * 2
                const ph2 = Math.random() * Math.PI * 2
                const amp1 = amp * 0.65
                const amp2 = amp * 0.45
                const x = hx + Math.cos(a1) * amp1 + Math.sin(a2 + ph2) * amp2
                const y = hy + Math.sin(a1 + ph1) * amp1 + Math.cos(a2) * amp2
                return {
                    hx, hy, x, y, vx: 0, vy: 0,
                    symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
                    size: minSize + Math.random() * (maxSize - minSize),
                    base: 0.1 + Math.random() * 0.35,
                    a1, r1: driftSpeed * (0.6 + Math.random() * 0.8), amp1, ph1,
                    a2, r2: driftSpeed * (0.3 + Math.random() * 0.5), amp2, ph2,
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
                // advance drift oscillators
                p.a1 += p.r1
                p.a2 += p.r2
                const dhx = p.hx + Math.cos(p.a1) * p.amp1 + Math.sin(p.a2 + p.ph2) * p.amp2
                const dhy = p.hy + Math.sin(p.a1 + p.ph1) * p.amp1 + Math.cos(p.a2) * p.amp2

                // drifting home → mouse distance (gravity anchor moves with drift)
                const hdx = mx - dhx
                const hdy = my - dhy
                const homeDist = Math.sqrt(hdx * hdx + hdy * hdy)

                // Spring target: drifting home nudged toward mouse, capped so it never reaches cursor
                let tx = dhx
                let ty = dhy
                if (homeDist > 1 && homeDist < attractRadius) {
                    const pull = (attractRadius - homeDist) / attractRadius
                    const maxPull = attractRadius * 0.35 * attractStrength * 0.08
                    const offset = maxPull * pull * pull
                    tx = dhx + (hdx / homeDist) * offset
                    ty = dhy + (hdy / homeDist) * offset
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
                const { r, g, b } = colorRef.current
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

        const resizeObserver = new ResizeObserver(() => init())
        resizeObserver.observe(canvas)

        return () => {
            cancelAnimationFrame(animId)
            window.removeEventListener("mousemove", onMove)
            canvas.removeEventListener("mouseleave", onLeave)
            observer.disconnect()
            resizeObserver.disconnect()
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
        driftAmplitude,
        driftSpeed,
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
    driftAmplitude: {
        type: ControlType.Number,
        defaultValue: 8,
        min: 0,
        max: 40,
        step: 1,
        title: "Drift range (px)",
    },
    driftSpeed: {
        type: ControlType.Number,
        defaultValue: 0.002,
        min: 0.0005,
        max: 0.01,
        step: 0.0005,
        title: "Drift speed",
    },
})
