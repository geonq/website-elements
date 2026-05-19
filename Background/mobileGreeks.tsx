import { useEffect, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"

const SYMBOLS = [
    "∑", "Δ", "σ", "π", "μ", "λ", "∞", "∂", "α", "β", "ρ", "θ", "φ", "ε", "η",
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

export default function MobileGreeks({
    count = 60,
    symbolColor = "#ffffff",
    minSize = 8,
    maxSize = 18,
    driftAmplitude = 14,
    driftSpeed = 0.003,
    baseOpacity = 0.22,
}) {
    const canvasRef = useRef(null)
    const colorRef = useRef({ r: 255, g: 255, b: 255 })

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext("2d")

        function refreshColor() {
            colorRef.current = resolveColor(symbolColor)
        }
        refreshColor()

        const observer = new MutationObserver(refreshColor)
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-framer-theme"] })

        let animId: number
        let W: number, H: number, dpr: number

        type Particle = {
            hx: number; hy: number
            x: number; y: number
            vx: number; vy: number
            symbol: string; size: number; alpha: number
            // two independent oscillators per particle for non-repetitive paths
            a1: number; r1: number; amp1: number; ph1: number
            a2: number; r2: number; amp2: number; ph2: number
        }
        let particles: Particle[] = []

        function resizeCanvas() {
            dpr = window.devicePixelRatio || 1
            W = canvas.offsetWidth
            H = canvas.offsetHeight
            canvas.width = W * dpr
            canvas.height = H * dpr
            ctx.scale(dpr, dpr)
        }

        function initParticles() {
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
                // start at the oscillator's current position so there's no initial spring tension
                const x = hx + Math.cos(a1) * amp1 + Math.sin(a2 + ph2) * amp2
                const y = hy + Math.sin(a1 + ph1) * amp1 + Math.cos(a2) * amp2
                return {
                    hx, hy, x, y, vx: 0, vy: 0,
                    symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
                    size: minSize + Math.random() * (maxSize - minSize),
                    alpha: baseOpacity * (0.6 + Math.random() * 0.8),
                    a1, r1: driftSpeed * (0.6 + Math.random() * 0.8), amp1, ph1,
                    a2, r2: driftSpeed * (0.3 + Math.random() * 0.5), amp2, ph2,
                }
            })
        }

        function draw() {
            ctx.clearRect(0, 0, W, H)

            for (const p of particles) {
                p.a1 += p.r1
                p.a2 += p.r2

                const tx = p.hx + Math.cos(p.a1) * p.amp1 + Math.sin(p.a2 + p.ph2) * p.amp2
                const ty = p.hy + Math.sin(p.a1 + p.ph1) * p.amp1 + Math.cos(p.a2) * p.amp2

                p.vx += (tx - p.x) * 0.025
                p.vy += (ty - p.y) * 0.025
                p.vx *= 0.92
                p.vy *= 0.92
                p.x += p.vx
                p.y += p.vy

                ctx.font = `${p.size}px monospace`
                const { r, g, b } = colorRef.current
                ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha})`
                ctx.fillText(p.symbol, p.x, p.y)
            }

            animId = requestAnimationFrame(draw)
        }

        resizeCanvas()
        initParticles()
        draw()

        // only resize canvas geometry on orientation change, never reinit particles
        const onResize = () => resizeCanvas()
        window.addEventListener("orientationchange", onResize)

        return () => {
            cancelAnimationFrame(animId)
            window.removeEventListener("orientationchange", onResize)
            observer.disconnect()
        }
    }, [count, symbolColor, minSize, maxSize, driftAmplitude, driftSpeed, baseOpacity])

    return (
        <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "100%", display: "block", pointerEvents: "none" }}
        />
    )
}

addPropertyControls(MobileGreeks, {
    count: {
        type: ControlType.Number,
        defaultValue: 60,
        min: 10,
        max: 200,
        title: "Count",
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
        defaultValue: 18,
        min: 8,
        max: 60,
        title: "Max size",
    },
    driftAmplitude: {
        type: ControlType.Number,
        defaultValue: 14,
        min: 2,
        max: 60,
        step: 1,
        title: "Drift range (px)",
    },
    driftSpeed: {
        type: ControlType.Number,
        defaultValue: 0.003,
        min: 0.0005,
        max: 0.015,
        step: 0.0005,
        title: "Drift speed",
    },
    baseOpacity: {
        type: ControlType.Number,
        defaultValue: 0.22,
        min: 0.05,
        max: 1,
        step: 0.01,
        title: "Opacity",
    },
})
