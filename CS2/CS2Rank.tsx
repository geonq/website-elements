// CS2Rank.tsx — Framer code component for the CS2 Premier rank badge.
//
// Pattern mirrors SpotifyNowPlaying: plain function component, single default
// export, property controls attached directly. The live data hook is embedded
// here so Framer can import the component as a single portable code file.

import * as React from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

const WORKER_URL = "https://cs2store.domkegeorg2017.workers.dev/cs2/profile"
const POLL_INTERVAL_MS = 60_000

type CS2Data = {
    premierRating: number | null
}

type CS2StoreState = {
    data: CS2Data | null
    loading: boolean
    error: string | null
}

// ==================== TIERS ====================

type TierKey = "gray" | "lightBlue" | "blue" | "purple" | "pink" | "red" | "gold"

type TierSpec = {
    key: TierKey
    name: string
    min: number
    max: number
    text: string
    edge: string
    stripe: string
    glow: string
    start: string
    middle: string
    end: string
}

const TIERS: TierSpec[] = [
    { key: "gray",      name: "Gray",       min: 0,     max: 4999,     text: "#E8EDF8", edge: "#C9D2E4", stripe: "#F3F7FF", glow: "#C6D0E1", start: "#5E6678", middle: "#42495B", end: "#2D3342" },
    { key: "lightBlue", name: "Light Blue", min: 5000,  max: 9999,     text: "#8ED9FF", edge: "#79CBFF", stripe: "#AEE9FF", glow: "#2AABFF", start: "#265A84", middle: "#1D4B77", end: "#13314E" },
    { key: "blue",      name: "Blue",       min: 10000, max: 14999,    text: "#6781FF", edge: "#6C80FF", stripe: "#8BA0FF", glow: "#355CFF", start: "#2A4CDA", middle: "#263DB9", end: "#1A2468" },
    { key: "purple",    name: "Purple",     min: 15000, max: 19999,    text: "#C46BFF", edge: "#B95CFF", stripe: "#D892FF", glow: "#8D37F6", start: "#9A36D6", middle: "#7F28B7", end: "#53146E" },
    { key: "pink",      name: "Pink",       min: 20000, max: 24999,    text: "#FF32E6", edge: "#FF27D8", stripe: "#FF7DEF", glow: "#EB00CE", start: "#BF00B2", middle: "#98008D", end: "#63015D" },
    { key: "red",       name: "Red",        min: 25000, max: 29999,    text: "#FF4B4B", edge: "#FF4141", stripe: "#FF8F8F", glow: "#FF2323", start: "#B30E0E", middle: "#8A0909", end: "#5E0505" },
    { key: "gold",      name: "Gold",       min: 30000, max: Infinity, text: "#FFD93A", edge: "#FFD22D", stripe: "#FFF08E", glow: "#FFCE1F", start: "#B68F00", middle: "#8D6D00", end: "#5F4600" },
]

// ==================== HELPERS ====================

function hexToRgba(hex: string, alpha: number): string {
    const h = hex.replace("#", "")
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
}

function formatRating(value: number): string {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        Math.max(0, Math.round(value))
    )
}

function getTier(value: number): TierSpec {
    return TIERS.find((t) => value >= t.min && value <= t.max) ?? TIERS[0]
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
}

function usePremierRatingData(): CS2StoreState {
    const [state, setState] = React.useState<CS2StoreState>({
        data: null,
        loading: true,
        error: null,
    })

    React.useEffect(() => {
        let active = true

        const load = async () => {
            setState((current) => ({
                data: current.data,
                loading: current.data === null,
                error: null,
            }))

            try {
                const response = await fetch(WORKER_URL, {
                    method: "GET",
                    headers: {
                        Accept: "application/json",
                    },
                })

                let payload: unknown = null

                try {
                    payload = await response.json()
                } catch {
                    payload = null
                }

                if (!response.ok) {
                    const message =
                        isRecord(payload) && typeof payload.error === "string"
                            ? payload.error
                            : `Request failed with status ${response.status}`

                    throw new Error(message)
                }

                if (!isRecord(payload)) {
                    throw new Error("Worker response shape was invalid.")
                }

                if (!active) return

                setState({
                    data: {
                        premierRating:
                            typeof payload.premierRating === "number"
                                ? payload.premierRating
                                : null,
                    },
                    loading: false,
                    error: null,
                })
            } catch (error) {
                if (!active) return

                setState((current) => ({
                    data: current.data,
                    loading: false,
                    error: error instanceof Error ? error.message : "Unknown CS2 fetch error.",
                }))
            }
        }

        void load()
        const intervalId = window.setInterval(() => {
            void load()
        }, POLL_INTERVAL_MS)

        return () => {
            active = false
            window.clearInterval(intervalId)
        }
    }, [])

    return state
}

// ==================== ANIMATION HOOK ====================
// Smoothly interpolates between rating values using easeOutCubic.
// Skips animation on first load (null -> value) so it doesn't count up from 0.

function useAnimatedNumber(
    target: number | null,
    duration: number,
    enabled: boolean
): number | null {
    const [value, setValue] = React.useState<number | null>(target)
    const valueRef = React.useRef<number | null>(target)
    valueRef.current = value
    const rafRef = React.useRef<number | null>(null)

    React.useEffect(() => {
        if (target === null) {
            setValue(null)
            return
        }
        if (!enabled || valueRef.current === null) {
            setValue(target)
            return
        }
        const from = valueRef.current
        if (from === target) return

        const startTime = performance.now()
        const step = (now: number) => {
            const elapsed = now - startTime
            const progress = Math.min(1, elapsed / duration)
            const eased = 1 - Math.pow(1 - progress, 3)
            setValue(from + (target - from) * eased)
            if (progress < 1) {
                rafRef.current = requestAnimationFrame(step)
            }
        }
        rafRef.current = requestAnimationFrame(step)

        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
        }
    }, [target, duration, enabled])

    return value
}

// ==================== COMPONENT ====================
//
// @framerSupportedLayoutWidth fixed
// @framerSupportedLayoutHeight auto
// @framerIntrinsicWidth 300
// @framerIntrinsicHeight 72

export default function CS2PremierRank(props: any) {
    const {
        previewValue,
        usePreviewOnCanvas,
        fallbackText,
        animateNumber,
        animateDuration,
        borderRadius,
        slantDeg,
        glowStrength,
        stripeWidth,
        stripeGap,
        paddingX,
        height,
        widthScale,
        numberFont,
        subLabelScale,
    } = props

    // 1. Subscribe to the live Premier rating feed.
    const cs2 = usePremierRatingData()
    const liveRating: number | null =
        typeof cs2?.data?.premierRating === "number" ? cs2.data.premierRating : null

    // 2. Decide what to display: live data > canvas preview > waiting.
    const renderTarget = RenderTarget.current()
    const isCanvas =
        renderTarget === RenderTarget.canvas || renderTarget === RenderTarget.thumbnail
    const targetRating: number | null =
        liveRating !== null
            ? liveRating
            : usePreviewOnCanvas && isCanvas
                ? previewValue
                : null
    // 3. Animate number transitions.
    const animatedRating = useAnimatedNumber(targetRating, animateDuration, animateNumber)
    const tier = getTier(animatedRating ?? 0)
    const displayText =
        animatedRating !== null ? formatRating(animatedRating) : fallbackText
    const fontStyle = numberFont ?? {}
    const numberFontSize =
        typeof fontStyle.fontSize === "number"
            ? fontStyle.fontSize
            : Number.parseFloat(String(fontStyle.fontSize ?? 28)) || 28
    const componentWidth = Math.round(numberFontSize * widthScale)
    const subLabelFontSize = Math.max(10, Math.round(numberFontSize * subLabelScale))

    // 4. Flash on tier boundary crossings.
    const [flashKey, setFlashKey] = React.useState(0)
    const prevTierKey = React.useRef<TierKey | null>(null)
    React.useEffect(() => {
        if (prevTierKey.current !== null && prevTierKey.current !== tier.key) {
            setFlashKey((k) => k + 1)
        }
        prevTierKey.current = tier.key
    }, [tier.key])

    const stripeOpacities = [1, 0.82, 0.6]

    return (
        <div
            style={{
                width: componentWidth,
                display: "flex",
                flexDirection: "column",
                gap: 8,
            }}
        >
            <style>{`
                @keyframes cs2-flash { 0% { opacity: 0; } 12% { opacity: 1; } 100% { opacity: 0; } }
            `}</style>

            {/* BADGE */}
            <div
                style={{
                    position: "relative",
                    width: componentWidth,
                    height,
                    filter: `drop-shadow(0 0 ${14 + glowStrength * 18}px ${hexToRgba(tier.glow, 0.22 + glowStrength * 0.22)})`,
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        transform: `skewX(-${slantDeg}deg)`,
                        borderRadius,
                        border: `1px solid ${hexToRgba(tier.edge, 0.9)}`,
                        background: `linear-gradient(135deg, ${tier.start} 0%, ${tier.middle} 52%, ${tier.end} 100%)`,
                        boxShadow: `inset 0 1px 0 ${hexToRgba(tier.stripe, 0.35)}, inset 0 -10px 24px ${hexToRgba("#000000", 0.28)}`,
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                    }}
                >
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            pointerEvents: "none",
                            background:
                                "linear-gradient(110deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0) 42%)",
                            mixBlendMode: "screen",
                        }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            pointerEvents: "none",
                            background:
                                "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 52%, rgba(0,0,0,0.22) 100%)",
                        }}
                    />

                    <div
                        style={{
                            display: "flex",
                            gap: stripeGap,
                            alignItems: "center",
                            paddingLeft: paddingX * 0.55,
                            height: "100%",
                            flexShrink: 0,
                        }}
                    >
                        {stripeOpacities.map((opacity, i) => (
                            <div
                                key={i}
                                style={{
                                    width: stripeWidth,
                                    height: "62%",
                                    background: `linear-gradient(180deg, ${tier.stripe} 0%, ${tier.edge} 100%)`,
                                    opacity,
                                    borderRadius: 1,
                                    boxShadow:
                                        i === 0
                                            ? `0 0 8px ${hexToRgba(tier.glow, 0.55)}`
                                            : "none",
                                }}
                            />
                        ))}
                    </div>

                    <div
                        style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transform: `skewX(${slantDeg}deg)`,
                            paddingRight: paddingX,
                            paddingLeft: 8,
                        }}
                    >
                        <div
                            style={{
                                color: tier.text,
                                textShadow: `0 0 ${8 + glowStrength * 10}px ${hexToRgba(tier.glow, 0.5)}`,
                                fontVariantNumeric: "tabular-nums",
                                whiteSpace: "nowrap",
                                ...fontStyle,
                                fontSize: numberFontSize,
                            }}
                        >
                            {displayText}
                        </div>
                    </div>

                    <div
                        key={flashKey}
                        style={{
                            position: "absolute",
                            inset: 0,
                            pointerEvents: "none",
                            background: `linear-gradient(90deg, ${hexToRgba(tier.stripe, 0)} 0%, ${hexToRgba(tier.stripe, 0.55)} 50%, ${hexToRgba(tier.stripe, 0)} 100%)`,
                            opacity: 0,
                            animation:
                                flashKey > 0 ? "cs2-flash 900ms ease-out" : undefined,
                        }}
                    />
                </div>
            </div>

            <div
                style={{
                    width: componentWidth,
                    color: hexToRgba(tier.text, 0.9),
                    fontVariantNumeric: "tabular-nums",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    ...fontStyle,
                    fontSize: subLabelFontSize,
                    lineHeight: 1.1,
                    letterSpacing:
                        typeof fontStyle.letterSpacing === "number"
                            ? fontStyle.letterSpacing * 0.35
                            : fontStyle.letterSpacing,
                }}
            >
                {displayText}
            </div>
        </div>
    )
}

// ==================== DEFAULTS & PROPERTY CONTROLS ====================

CS2PremierRank.defaultProps = {
    previewValue: 18520,
    usePreviewOnCanvas: true,
    fallbackText: "—",
    animateNumber: true,
    animateDuration: 900,
    numberFont: {
        fontFamily: "Orbitron",
        fontSize: 28,
        fontWeight: 900,
        fontStyle: "italic",
        letterSpacing: "-0.04em",
        lineHeight: 1,
        textAlign: "center",
    },
    widthScale: 10.8,
    subLabelScale: 0.42,
    borderRadius: 6,
    slantDeg: 11,
    glowStrength: 0.85,
    stripeWidth: 6,
    stripeGap: 3,
    paddingX: 22,
    height: 58,
}

addPropertyControls(CS2PremierRank, {
    previewValue: {
        type: ControlType.Number,
        title: "Preview",
        defaultValue: 18520,
        min: 0,
        max: 45000,
        step: 1,
        displayStepper: true,
    },
    usePreviewOnCanvas: {
        type: ControlType.Boolean,
        title: "Canvas Demo",
        defaultValue: true,
        enabledTitle: "On",
        disabledTitle: "Off",
    },
    fallbackText: { type: ControlType.String, title: "Fallback", defaultValue: "—" },

    animateNumber: {
        type: ControlType.Boolean,
        title: "Animate #",
        defaultValue: true,
        enabledTitle: "On",
        disabledTitle: "Off",
    },
    animateDuration: {
        type: ControlType.Number,
        title: "Anim (ms)",
        defaultValue: 900,
        min: 100,
        max: 3000,
        step: 50,
        displayStepper: true,
        hidden: (p: any) => !p.animateNumber,
    },
    numberFont: {
        type: ControlType.Font,
        title: "Font",
        controls: "extended",
        defaultFontType: "sans-serif",
        displayFontSize: true,
        displayTextAlignment: true,
        defaultValue: {
            fontFamily: "Orbitron",
            fontSize: 28,
            fontWeight: 900,
            fontStyle: "italic",
            letterSpacing: "-0.04em",
            lineHeight: 1,
            textAlign: "center",
        },
    },
    widthScale: {
        type: ControlType.Number,
        title: "Width",
        defaultValue: 10.8,
        min: 7,
        max: 16,
        step: 0.1,
        displayStepper: true,
    },
    subLabelScale: {
        type: ControlType.Number,
        title: "Label Size",
        defaultValue: 0.42,
        min: 0.25,
        max: 0.8,
        step: 0.01,
        displayStepper: true,
    },
    height: {
        type: ControlType.Number,
        title: "Height",
        defaultValue: 58,
        min: 36,
        max: 140,
        step: 1,
        displayStepper: true,
    },
    paddingX: {
        type: ControlType.Number,
        title: "Pad X",
        defaultValue: 22,
        min: 8,
        max: 60,
        step: 1,
        displayStepper: true,
    },
    borderRadius: {
        type: ControlType.Number,
        title: "Radius",
        defaultValue: 6,
        min: 0,
        max: 24,
        step: 1,
        displayStepper: true,
    },
    slantDeg: {
        type: ControlType.Number,
        title: "Slant°",
        defaultValue: 11,
        min: 0,
        max: 20,
        step: 1,
        displayStepper: true,
    },
    stripeWidth: {
        type: ControlType.Number,
        title: "Stripe W",
        defaultValue: 6,
        min: 2,
        max: 14,
        step: 1,
        displayStepper: true,
    },
    stripeGap: {
        type: ControlType.Number,
        title: "Stripe Gap",
        defaultValue: 3,
        min: 1,
        max: 10,
        step: 1,
        displayStepper: true,
    },
    glowStrength: {
        type: ControlType.Number,
        title: "Glow",
        defaultValue: 0.85,
        min: 0,
        max: 1.5,
        step: 0.05,
    },
})
