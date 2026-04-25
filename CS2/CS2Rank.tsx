// CS2Rank.tsx — Framer code component for the CS2 Premier rank badge.
//
// Pattern mirrors SpotifyNowPlaying: plain function component, single default
// export, property controls attached directly. The live data hook is embedded
// here so Framer can import the component as a single portable code file.

import * as React from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { motion } from "framer-motion"

const WORKER_URL = "https://cs2store.domkegeorg2017.workers.dev/cs2/profile"
const POLL_INTERVAL_MS = 60_000
const LOCAL_DEBUG_DELTA_STORAGE_KEY = "cs2-rank-local-debug-delta"
const LOCAL_DEBUG_DELTA_EVENT = "cs2-rank-local-debug-delta-change"

type TransitionCacheEntry = {
    text: string
    key: number
}

const transitionCache = new Map<string, TransitionCacheEntry>()

type CS2Data = {
    premierRating: number | null
}

type CS2StoreState = {
    data: CS2Data | null
    loading: boolean
    error: string | null
}

type LocalDebugOverride = {
    active: boolean
    delta: number
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

function splitRatingText(text: string) {
    const parts = text.split(",")

    if (parts.length === 1) {
        return { major: text, minor: null as string | null }
    }

    return {
        major: parts.slice(0, -1).join(","),
        minor: parts[parts.length - 1],
    }
}

function parseRatingNumber(text: string): number | null {
    const normalized = text.replace(/[^\d-]/g, "")
    if (normalized === "") {
        return null
    }

    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
}

function padStartTokens(tokens: string[], length: number): Array<string | null> {
    return Array.from({ length }, (_, index) => {
        const offset = length - tokens.length
        return index < offset ? null : tokens[index - offset]
    })
}

function slotDelay(index: number, total: number) {
    const fromRight = total - index - 1
    const deterministicJitter = ((index * 37) % 7) * 0.04
    return Math.min(0.18, 0.03 + fromRight * 0.02 + deterministicJitter)
}

function buildDigitRoll(
    previousChar: string | null,
    currentChar: string | null,
    index: number,
    total: number,
    pushesUp: boolean
): string[] {
    const empty = "\u00A0"

    if (previousChar === currentChar) {
        return [currentChar ?? empty]
    }

    const previousIsDigit = previousChar !== null && /^\d$/.test(previousChar)
    const currentIsDigit = currentChar !== null && /^\d$/.test(currentChar)

    if (!previousIsDigit || !currentIsDigit) {
        return [previousChar ?? empty, currentChar ?? empty]
    }

    const directionStep = pushesUp ? 1 : -1
    const extraCount = 1 + ((index * 17 + total) % 2)
    const frames = [previousChar]
    let cursor = Number(previousChar)

    for (let step = 0; step < extraCount; step += 1) {
        cursor = (cursor + directionStep + 10) % 10
        frames.push(String(cursor))
    }

    frames.push(currentChar)
    return frames
}

function readLocalDebugOverride(): LocalDebugOverride {
    if (typeof window === "undefined") {
        return { active: false, delta: 0 }
    }

    const raw = window.localStorage.getItem(LOCAL_DEBUG_DELTA_STORAGE_KEY)
    if (raw === null) {
        return { active: false, delta: 0 }
    }

    const parsed = Number(raw)
    return Number.isFinite(parsed)
        ? { active: true, delta: parsed }
        : { active: false, delta: 0 }
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

function useLocalDebugOverride(): LocalDebugOverride {
    const [override, setOverride] = React.useState<LocalDebugOverride>({
        active: false,
        delta: 0,
    })

    React.useEffect(() => {
        if (typeof window === "undefined") {
            return
        }

        const sync = () => {
            setOverride(readLocalDebugOverride())
        }

        const handleCustomEvent = (event: Event) => {
            const detail = (
                event as CustomEvent<{ delta?: unknown; active?: unknown }>
            ).detail
            const next = Number(detail?.delta)
            const active =
                typeof detail?.active === "boolean"
                    ? detail.active
                    : Number.isFinite(next)

            setOverride(
                active && Number.isFinite(next)
                    ? { active: true, delta: next }
                    : readLocalDebugOverride()
            )
        }

        sync()
        window.addEventListener("storage", sync)
        window.addEventListener(LOCAL_DEBUG_DELTA_EVENT, handleCustomEvent as EventListener)

        return () => {
            window.removeEventListener("storage", sync)
            window.removeEventListener(LOCAL_DEBUG_DELTA_EVENT, handleCustomEvent as EventListener)
        }
    }, [])

    return override
}

function useRankChangeDisplay(
    nextText: string,
    enabled: boolean,
    duration: number,
    cacheKey: string
) {
    const [state, setState] = React.useState(() => {
        const cached = transitionCache.get(cacheKey)
        const shouldAnimate =
            enabled &&
            cached !== undefined &&
            cached.text !== nextText &&
            cached.text !== "—" &&
            nextText !== "—"

        return {
            currentText: nextText,
            previousText: shouldAnimate ? cached!.text : null,
            key: shouldAnimate ? cached!.key + 1 : cached?.key ?? 0,
            animationActive: shouldAnimate,
        }
    })
    const timeoutRef = React.useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
    const currentTextRef = React.useRef(state.currentText)

    React.useEffect(() => {
        transitionCache.set(cacheKey, {
            text: state.currentText,
            key: state.key,
        })
    }, [cacheKey, state.currentText, state.key])

    React.useEffect(() => {
        currentTextRef.current = state.currentText
    }, [state.currentText])

    React.useEffect(() => {
        if (!state.animationActive || state.previousText === null) {
            return
        }

        if (timeoutRef.current !== null) {
            globalThis.clearTimeout(timeoutRef.current)
        }

        timeoutRef.current = globalThis.setTimeout(() => {
            setState((previousState) => ({
                ...previousState,
                animationActive: false,
            }))
            timeoutRef.current = null
        }, duration)

        return () => {
            if (timeoutRef.current !== null) {
                globalThis.clearTimeout(timeoutRef.current)
                timeoutRef.current = null
            }
        }
    }, [duration, state.animationActive, state.previousText])

    React.useEffect(() => {
        const currentText = currentTextRef.current

        if (currentText === nextText) {
            return
        }

        if (timeoutRef.current !== null) {
            globalThis.clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }

        const shouldAnimate = enabled && currentText !== "—" && nextText !== "—"

        setState((previousState) => ({
            currentText: nextText,
            previousText: shouldAnimate ? currentText : null,
            key: shouldAnimate ? previousState.key + 1 : previousState.key,
            animationActive: shouldAnimate,
        }))

        currentTextRef.current = nextText

        return () => {
            if (timeoutRef.current !== null) {
                globalThis.clearTimeout(timeoutRef.current)
                timeoutRef.current = null
            }
        }
    }, [duration, enabled, nextText])

    return state
}

// ==================== COMPONENT ====================
//
// @framerSupportedLayoutWidth fixed
// @framerSupportedLayoutHeight auto
// @framerIntrinsicWidth 140
// @framerIntrinsicHeight 50

function getBadgeDimensions(fontSize: number) {
    return {
        width: Math.round(fontSize * 4.95),
        height: Math.round(fontSize * 1.78),
        borderRadius: Math.max(3, Math.round(fontSize * 0.18)),
        stripeWidth: Math.max(2, Math.round(fontSize * 0.18)),
        stripeGap: Math.max(1, Math.round(fontSize * 0.08)),
        stripeHeight: `${Math.max(50, Math.min(68, Math.round(fontSize * 2.15)))}%`,
        leftRailPadding: Math.round(fontSize * 0.42),
        rightPadding: Math.round(fontSize * 0.62),
        innerLeftPadding: Math.round(fontSize * 0.22),
        borderWidth: Math.max(1, Math.round(fontSize * 0.045)),
    }
}

function renderRankText(
    currentText: string,
    previousText: string | null,
    animationActive: boolean,
    fontStyle: Record<string, unknown>,
    numberFontSize: number,
    textSlantDeg: number,
    color: string,
    glowStrength: number,
    glowColor: string,
    durationSeconds: number
) {
    const { major, minor } = splitRatingText(currentText)
    const previousParts = previousText ? splitRatingText(previousText) : null
    const currentValue = parseRatingNumber(currentText)
    const previousValue = previousText ? parseRatingNumber(previousText) : null
    const pushesUp =
        previousValue !== null && currentValue !== null ? currentValue > previousValue : true
    const minorFontSize = Math.round(numberFontSize * 0.74)
    const majorTokens = major.split("")
    const previousMajorTokens = previousParts ? previousParts.major.split("") : []
    const maxMajorLength = Math.max(majorTokens.length, previousMajorTokens.length)
    const currentMajorSlots = padStartTokens(majorTokens, maxMajorLength)
    const previousMajorSlots = padStartTokens(previousMajorTokens, maxMajorLength)
    const minorTokens = minor ? minor.split("") : []
    const previousMinorTokens = previousParts?.minor ? previousParts.minor.split("") : []
    const maxMinorLength = Math.max(minorTokens.length, previousMinorTokens.length)
    const currentMinorSlots = minorTokens.concat(Array(Math.max(0, maxMinorLength - minorTokens.length)).fill(null))
    const previousMinorSlots = previousMinorTokens.concat(
        Array(Math.max(0, maxMinorLength - previousMinorTokens.length)).fill(null)
    )

    const renderSlot = (
        currentChar: string | null,
        previousChar: string | null,
        index: number,
        total: number,
        fontSize: number
    ) => {
        const changed = previousText !== null && previousChar !== currentChar
        const shouldAnimateSlot = changed && animationActive
        const delay = shouldAnimateSlot ? slotDelay(index, total) : 0
        const slotHeight = fontSize * 1.1
        const sizingChar = currentChar ?? previousChar ?? "\u00A0"

        const rollFrames = buildDigitRoll(previousChar, currentChar, index, total, pushesUp)
        const changedStack = pushesUp ? rollFrames : [...rollFrames].reverse()
        const stack = changed ? changedStack : [currentChar ?? "\u00A0"]
        const travelDistance = (changedStack.length - 1) * slotHeight
        const initialY = pushesUp ? 0 : -travelDistance
        const targetY = changed ? (pushesUp ? -travelDistance : 0) : 0

        return (
            <span
                key={`animated-${index}-${currentChar}-${previousChar}`}
                style={{
                    position: "relative",
                    display: "inline-grid",
                    justifyItems: "stretch",
                    alignItems: "end",
                    height: slotHeight,
                    overflow: "hidden",
                }}
            >
                <span
                    style={{
                        gridArea: "1 / 1",
                        visibility: "hidden",
                        display: "inline-flex",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        height: slotHeight,
                    }}
                >
                    {sizingChar}
                </span>
                <motion.span
                    initial={shouldAnimateSlot ? { y: initialY } : false}
                    animate={{ y: targetY }}
                    transition={{
                        duration: shouldAnimateSlot ? durationSeconds : 0,
                        ease: [0.2, 0.9, 0.2, 1],
                        delay,
                    }}
                    style={{
                        gridArea: "1 / 1",
                        width: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "stretch",
                    }}
                >
                    {stack.map((char, frameIndex) => (
                        <span
                            key={`${index}-${frameIndex}-${char}`}
                            style={{
                                width: "100%",
                                height: slotHeight,
                                display: "inline-flex",
                                alignItems: "flex-end",
                                justifyContent: "center",
                            }}
                        >
                            {char}
                        </span>
                    ))}
                </motion.span>
            </span>
        )
    }

    return (
        <motion.div
            initial={false}
            animate={{
                color,
                textShadow: `0 0 ${8 + glowStrength * 10}px ${hexToRgba(glowColor, 0.5)}`,
            }}
            transition={{
                duration: durationSeconds,
                ease: [0.22, 1, 0.36, 1],
            }}
            style={{
                fontVariantNumeric: "tabular-nums",
                fontFeatureSettings: '"tnum" 1, "lnum" 1',
                whiteSpace: "nowrap",
                transform: `skewX(-${textSlantDeg}deg)`,
                transformOrigin: "center",
                display: "inline-flex",
                alignItems: "flex-end",
                ...fontStyle,
                fontSize: numberFontSize,
            }}
        >
            <span
                style={{
                    display: "inline-flex",
                    alignItems: "flex-end",
                }}
            >
                {currentMajorSlots.map((char, index) =>
                    renderSlot(
                        char,
                        previousMajorSlots[index] ?? null,
                        index,
                        currentMajorSlots.length,
                        numberFontSize
                    )
                )}
            </span>
            {minor ? (
                <span
                    style={{
                        fontSize: minorFontSize,
                        lineHeight: 0.92,
                        display: "inline-flex",
                        alignItems: "flex-end",
                        transform: "translateY(-0.03em)",
                        marginLeft: "0.01em",
                    }}
                >
                    <span
                        style={{
                            display: "inline-flex",
                            justifyContent: "center",
                        }}
                    >
                        ,
                    </span>
                    {currentMinorSlots.map((char, index) =>
                        renderSlot(
                            char,
                            previousMinorSlots[index] ?? null,
                            maxMajorLength + index,
                            maxMajorLength + currentMinorSlots.length,
                            minorFontSize
                        )
                    )}
                </span>
            ) : null}
        </motion.div>
    )
}

export default function CS2PremierRank(props: any) {
    const {
        previewValue,
        usePreviewOnCanvas,
        fallbackText,
        animateNumber,
        animateDuration,
        slantDeg,
        textSlantDeg,
        glowStrength,
        numberFont,
    } = props

    // 1. Subscribe to the live Premier rating feed.
    const cs2 = usePremierRatingData()
    const liveRating: number | null =
        typeof cs2?.data?.premierRating === "number" ? cs2.data.premierRating : null
    const localDebugOverride = useLocalDebugOverride()

    // 2. Decide what to display: live data > canvas preview > waiting.
    const renderTarget = RenderTarget.current()
    const isCanvas =
        renderTarget === RenderTarget.canvas || renderTarget === RenderTarget.thumbnail
    const baseRating: number | null =
        usePreviewOnCanvas && isCanvas
            ? previewValue
            : liveRating !== null
                ? liveRating
                : null
    const localBaseRef = React.useRef<number | null>(null)
    React.useEffect(() => {
        if (!localDebugOverride.active) {
            localBaseRef.current = null
            return
        }

        if (localBaseRef.current === null) {
            localBaseRef.current = baseRating ?? 0
        }
    }, [baseRating, localDebugOverride.active])

    const targetRating: number | null = localDebugOverride.active
        ? Math.max(0, (localBaseRef.current ?? baseRating ?? 0) + localDebugOverride.delta)
        : baseRating
    // 3. Prepare the current display text and CS2-style change animation.
    const displayText = targetRating !== null ? formatRating(targetRating) : fallbackText
    const transitionCacheKey =
        usePreviewOnCanvas && isCanvas ? "cs2-rank-preview-canvas" : "cs2-rank-live"
    const transitionState = useRankChangeDisplay(
        displayText,
        animateNumber,
        animateDuration,
        transitionCacheKey
    )
    const currentTier = getTier(parseRatingNumber(transitionState.currentText) ?? targetRating ?? 0)
    const fontStyle = numberFont ?? {}
    const numberFontSize =
        typeof fontStyle.fontSize === "number"
            ? fontStyle.fontSize
            : Number.parseFloat(String(fontStyle.fontSize ?? 28)) || 28
    const stripeOpacities = [1, 0.82, 0.6]
    const dimensions = getBadgeDimensions(numberFontSize)
    const rollDurationSeconds = animateDuration / 1000
    const stripeRailWidth =
        dimensions.leftRailPadding +
        stripeOpacities.length * dimensions.stripeWidth +
        Math.max(0, stripeOpacities.length - 1) * dimensions.stripeGap
    const tierTransition = {
        duration: rollDurationSeconds,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    }

    // 4. Trigger the sweep whenever the displayed rank actually changes.
    const [flashKey, setFlashKey] = React.useState(0)
    const prevDisplayText = React.useRef<string | null>(null)
    React.useEffect(() => {
        if (
            prevDisplayText.current !== null &&
            prevDisplayText.current !== displayText &&
            prevDisplayText.current !== fallbackText &&
            displayText !== fallbackText
        ) {
            setFlashKey((k) => k + 1)
        }
        prevDisplayText.current = displayText
    }, [displayText, fallbackText])

    return (
        <div
            style={{
                width: dimensions.width,
                height: dimensions.height,
            }}
        >
            <style>{`
                @keyframes cs2-flash { 0% { opacity: 0; } 14% { opacity: 1; } 100% { opacity: 0; } }
            `}</style>

            {/* BADGE */}
            <div
                style={{
                    position: "relative",
                    width: dimensions.width,
                    height: dimensions.height,
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        transform: `skewX(-${slantDeg}deg)`,
                        borderRadius: dimensions.borderRadius,
                        overflow: "hidden",
                    }}
                >
                    <motion.div
                        initial={false}
                        animate={{
                            borderColor: hexToRgba(currentTier.edge, 0.9),
                            background: `linear-gradient(135deg, ${currentTier.start} 0%, ${currentTier.middle} 52%, ${currentTier.end} 100%)`,
                            boxShadow: `inset 0 1px 0 ${hexToRgba(currentTier.stripe, 0.35)}, inset 0 -10px 24px ${hexToRgba("#000000", 0.28)}`,
                            filter: `drop-shadow(0 0 ${14 + glowStrength * 18}px ${hexToRgba(currentTier.glow, 0.22 + glowStrength * 0.22)})`,
                        }}
                        transition={tierTransition}
                        style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: dimensions.borderRadius,
                            border: `${dimensions.borderWidth}px solid ${hexToRgba(currentTier.edge, 0.9)}`,
                            background: `linear-gradient(135deg, ${currentTier.start} 0%, ${currentTier.middle} 52%, ${currentTier.end} 100%)`,
                            boxShadow: `inset 0 1px 0 ${hexToRgba(currentTier.stripe, 0.35)}, inset 0 -10px 24px ${hexToRgba("#000000", 0.28)}`,
                            filter: `drop-shadow(0 0 ${14 + glowStrength * 18}px ${hexToRgba(currentTier.glow, 0.22 + glowStrength * 0.22)})`,
                            overflow: "hidden",
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
                                position: "absolute",
                                left: 0,
                                top: 0,
                                bottom: 0,
                                display: "flex",
                                gap: dimensions.stripeGap,
                                alignItems: "center",
                                paddingLeft: dimensions.leftRailPadding,
                                flexShrink: 0,
                            }}
                        >
                            {stripeOpacities.map((opacity, i) => (
                                <motion.div
                                    key={i}
                                    initial={false}
                                    animate={{
                                        background: `linear-gradient(180deg, ${currentTier.stripe} 0%, ${currentTier.edge} 100%)`,
                                        boxShadow:
                                            i === 0
                                                ? `0 0 8px ${hexToRgba(currentTier.glow, 0.55)}`
                                                : "none",
                                    }}
                                    transition={tierTransition}
                                    style={{
                                        width: dimensions.stripeWidth,
                                        height: dimensions.stripeHeight,
                                        background: `linear-gradient(180deg, ${currentTier.stripe} 0%, ${currentTier.edge} 100%)`,
                                        opacity,
                                        borderRadius: 1,
                                        boxShadow:
                                            i === 0
                                                ? `0 0 8px ${hexToRgba(currentTier.glow, 0.55)}`
                                                : "none",
                                    }}
                                />
                            ))}
                        </div>
                    </motion.div>

                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                        }}
                    >
                        <div
                            style={{
                                width: stripeRailWidth,
                                flexShrink: 0,
                            }}
                        />
                        <div
                            style={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transform: `skewX(${slantDeg}deg)`,
                                paddingRight: dimensions.rightPadding,
                                paddingLeft: dimensions.innerLeftPadding,
                                position: "relative",
                                overflow: "hidden",
                            }}
                        >
                            {renderRankText(
                                transitionState.currentText,
                                transitionState.previousText,
                                transitionState.animationActive,
                                fontStyle,
                                numberFontSize,
                                textSlantDeg,
                                currentTier.text,
                                glowStrength,
                                currentTier.glow,
                                rollDurationSeconds
                            )}
                        </div>
                    </div>

                    <div
                        key={flashKey}
                        style={{
                            position: "absolute",
                            inset: 0,
                            pointerEvents: "none",
                            background: `linear-gradient(90deg, ${hexToRgba(currentTier.stripe, 0)} 0%, ${hexToRgba(currentTier.stripe, 0.55)} 50%, ${hexToRgba(currentTier.stripe, 0)} 100%)`,
                            opacity: 0,
                            animation:
                                flashKey > 0 ? "cs2-flash 900ms ease-out" : undefined,
                        }}
                    />
                </div>
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
    animateDuration: 1050,
    numberFont: {
        fontFamily: "Orbitron",
        fontSize: 28,
        fontWeight: 900,
        fontStyle: "italic",
        letterSpacing: "-0.04em",
        lineHeight: 1,
        textAlign: "center",
    },
    slantDeg: 11,
    textSlantDeg: 10,
    glowStrength: 0.85,
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
        defaultValue: 1050,
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
    slantDeg: {
        type: ControlType.Number,
        title: "Slant°",
        defaultValue: 11,
        min: 0,
        max: 20,
        step: 1,
        displayStepper: true,
    },
    textSlantDeg: {
        type: ControlType.Number,
        title: "Text Slant",
        defaultValue: 10,
        min: 0,
        max: 24,
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
