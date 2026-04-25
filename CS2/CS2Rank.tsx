// CS2Rank.tsx — Framer code component for the CS2 Premier rank badge.
//
// Plain Framer code component with the live data hook embedded so the badge
// can be imported as a single portable code file.
//
// What this file does:
//   1. Polls a Cloudflare Worker every 60s for the current Premier rating.
//   2. Renders a CS2-styled badge with tier-based coloring (gray → gold).
//   3. Animates rating changes with a digit-by-digit slot-machine roll.
//   4. Cross-fades the badge gradient/glow as the rating crosses tier
//      boundaries (e.g. Purple → Pink at 20,000).
//   5. Flashes a sweep across the badge whenever the displayed value changes.

import * as React from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { motion } from "framer-motion"

// ==================== CONSTANTS ====================

const WORKER_URL = "https://cs2store.domkegeorg2017.workers.dev/cs2/profile"
const POLL_INTERVAL_MS = 60_000

// ==================== TYPES ====================

type CS2Data = {
    premierRating: number | null
}

type TierKey = "gray" | "lightBlue" | "blue" | "purple" | "pink" | "red" | "gold"

type TierSpec = {
    key: TierKey
    name: string
    min: number
    max: number
    text: string    // primary number color
    edge: string    // border + stripe outline
    stripe: string  // stripe highlight (top of gradient)
    glow: string    // outer drop-shadow tint
    start: string   // gradient stop 0%
    middle: string  // gradient stop 52%
    end: string     // gradient stop 100%
}

// All seven CS2 Premier tiers with their official(-ish) color palettes.
// Min/max are inclusive. Each tier has the same gradient structure (3 stops at
// 0/52/100%) which lets framer-motion smoothly interpolate between them when
// the rating crosses a boundary.
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

// Convert "#RRGGBB" or "#RGB" to "rgba(r,g,b,a)". Used to add alpha channel
// to tier colors when we want translucency (borders, glows, inset shadows).
function hexToRgba(hex: string, alpha: number): string {
    const h = hex.replace("#", "")
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
}

// Format a rating as "18,520" with commas as thousand separators.
function formatRating(value: number): string {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        Math.max(0, Math.round(value))
    )
}

// Split "18,520" into { major: "18", minor: "520" } so we can render the
// thousands part smaller (matching the in-game CS2 badge styling).
// "1234" with no comma → { major: "1234", minor: null }
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

// Strip non-digit characters and parse to a number, returning null for
// unparseable input. Used to detect direction (gain vs loss) for the digit
// roll animation.
function parseRatingNumber(text: string): number | null {
    const normalized = text.replace(/[^\d-]/g, "")
    if (normalized === "") {
        return null
    }

    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
}

// Left-pad a token array with nulls so two strings of different lengths can be
// rendered as aligned slots. e.g. previous="9" (1 digit) and next="10"
// (2 digits) → previous becomes [null, "9"] aligned with next ["1", "0"].
// This way the new leftmost digit ("1") animates in from a blank slot.
function padStartTokens(tokens: string[], length: number): Array<string | null> {
    return Array.from({ length }, (_, index) => {
        const offset = length - tokens.length
        return index < offset ? null : tokens[index - offset]
    })
}

// Per-slot stagger delay in seconds. The rightmost digit starts first, the
// leftmost last — creating a right-to-left wave (like a slot machine settling
// from the cents column inward). The deterministic jitter keeps the wave from
// looking too mechanical without introducing actual randomness (which would
// re-roll on every render).
function slotDelay(index: number, total: number) {
    const fromRight = total - index - 1
    const deterministicJitter = ((index * 37) % 7) * 0.04
    return Math.min(0.18, 0.03 + fromRight * 0.02 + deterministicJitter)
}

function maxSlotDelay(text: string) {
    const { major, minor } = splitRatingText(text)
    const total = major.length + (minor ? minor.length : 0)
    let maxDelay = 0

    for (let index = 0; index < total; index += 1) {
        maxDelay = Math.max(maxDelay, slotDelay(index, total))
    }

    return maxDelay
}

// Build the sequence of frames a single digit cycles through during a roll.
// For unchanged digits, returns a single-frame array (no animation).
// For digit→digit transitions, returns a slot-machine spinner that overshoots
// the target and lands on it (e.g. 9→0 might cycle as 9, 0, 1, 0).
// For digit→non-digit (or vice versa), returns a simple two-frame swap.
function buildDigitRoll(
    previousChar: string | null,
    currentChar: string | null,
    index: number,
    total: number,
    pushesUp: boolean
): string[] {
    const empty = "\u00A0" // non-breaking space — preserves slot width

    if (previousChar === currentChar) {
        return [currentChar ?? empty]
    }

    const previousIsDigit = previousChar !== null && /^\d$/.test(previousChar)
    const currentIsDigit = currentChar !== null && /^\d$/.test(currentChar)

    // Comma↔digit, blank↔digit, etc — just swap, don't try to "roll" through.
    if (!previousIsDigit || !currentIsDigit) {
        return [previousChar ?? empty, currentChar ?? empty]
    }

    // Build a digit-sequence path from previous to current. Direction depends
    // on whether the overall rating went up or down. extraCount adds 1-2
    // overshoot frames for the slot-machine feel.
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

// Find the tier whose [min, max] range contains the given rating.
function getTier(value: number): TierSpec {
    return TIERS.find((t) => value >= t.min && value <= t.max) ?? TIERS[0]
}

// Type-guard for narrowing `unknown` payloads from the Worker fetch.
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
}

// ==================== HOOKS ====================

function usePremierRatingData(): CS2Data | null {
    const [data, setData] = React.useState<CS2Data | null>(null)

    React.useEffect(() => {
        let active = true // prevents setState after unmount

        const load = async () => {
            try {
                const response = await fetch(WORKER_URL, {
                    method: "GET",
                    headers: { Accept: "application/json" },
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

                setData({
                    premierRating:
                        typeof payload.premierRating === "number"
                            ? payload.premierRating
                            : null,
                })
            } catch (error) {
                if (!active) return
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

    return data
}

// State machine for the rank-change roll animation.
//
// State shape:
//   currentText:     the rating string we're displaying right now
//   previousText:    the string we just rolled FROM (null if no animation)
//   animationActive: whether we're currently mid-roll
//
// Two effects manage the lifecycle:
//   1. Detect text changes and kick off a new animation (setState with
//      previousText set so the next render rolls).
//   2. Schedule the "animation complete" timeout that flips animationActive
//      back to false once the digits have settled.
//
function useRankChangeDisplay(
    nextText: string,
    enabled: boolean,
    duration: number,
    settleDelayMs: number
) {
    const [state, setState] = React.useState(() => ({
        currentText: nextText,
        previousText: null as string | null,
        animationActive: false,
    }))
    const timeoutRef = React.useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)

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
                previousText: null,
                animationActive: false,
            }))
            timeoutRef.current = null
        }, duration + settleDelayMs + 40)

        return () => {
            if (timeoutRef.current !== null) {
                globalThis.clearTimeout(timeoutRef.current)
                timeoutRef.current = null
            }
        }
    }, [duration, settleDelayMs, state.animationActive, state.previousText])

    React.useEffect(() => {
        if (state.currentText === nextText) {
            return
        }

        if (timeoutRef.current !== null) {
            globalThis.clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }

        const shouldAnimate = enabled && state.currentText !== "—" && nextText !== "—"

        setState({
            currentText: nextText,
            previousText: shouldAnimate ? state.currentText : null,
            animationActive: shouldAnimate,
        })
    }, [enabled, nextText, state.currentText])

    return state
}

// ==================== LAYOUT MATH ====================

// All badge dimensions scale off the font size. These multipliers were
// hand-tuned against reference screenshots of the in-game CS2 badge.
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

// ==================== TEXT RENDERING ====================

// Renders the rank number with per-digit slot-machine animation.
// Each digit is its own <span> with overflow:hidden, containing a vertical
// stack of frames that translates upward (or downward) to reveal each frame.
// The motion.span handles the actual easing.
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

    // Determine roll direction so digits scroll the "right way".
    // Up means rating gained (digits roll upward, ascending).
    const currentValue = parseRatingNumber(currentText)
    const previousValue = previousText ? parseRatingNumber(previousText) : null
    const pushesUp =
        previousValue !== null && currentValue !== null
            ? currentValue > previousValue
            : true // default to "gained" feel when direction is ambiguous

    // The thousands part renders smaller (CS2 styling convention).
    const minorFontSize = Math.round(numberFontSize * 0.74)

    const majorTokens = major.split("")
    const previousMajorTokens = previousParts ? previousParts.major.split("") : []
    const maxMajorLength = Math.max(majorTokens.length, previousMajorTokens.length)
    const currentMajorSlots = padStartTokens(majorTokens, maxMajorLength)
    const previousMajorSlots = padStartTokens(previousMajorTokens, maxMajorLength)

    const minorTokens = minor ? minor.split("") : []
    const previousMinorTokens = previousParts?.minor ? previousParts.minor.split("") : []
    const maxMinorLength = Math.max(minorTokens.length, previousMinorTokens.length)
    const currentMinorSlots = minorTokens.concat(
        Array(Math.max(0, maxMinorLength - minorTokens.length)).fill(null)
    )
    const previousMinorSlots = previousMinorTokens.concat(
        Array(Math.max(0, maxMinorLength - previousMinorTokens.length)).fill(null)
    )

    // renderSlot draws a single digit cell with its own roll animation.
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

        // Build the animation frames for this slot. For unchanged digits this
        // is a single frame — no actual movement. For changed digits, it's a
        // multi-frame spinner.
        const rollFrames = buildDigitRoll(previousChar, currentChar, index, total, pushesUp)
        const changedStack = pushesUp ? rollFrames : [...rollFrames].reverse()
        const stack = changed ? changedStack : [currentChar ?? "\u00A0"]

        // Compute starting and ending Y positions. The stack of frames is laid
        // out vertically; we translate it upward (negative Y) to scroll
        // through. pushesUp controls direction.
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
                    overflow: "hidden", // crop the off-screen stack frames
                }}
            >
                {/* Invisible sizer — reserves slot width based on the widest
                    expected character. Without this, the slot would collapse
                    around the currently-visible frame. */}
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
                        ease: [0.2, 0.9, 0.2, 1], // snappy with a soft tail
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
                fontVariantNumeric: "tabular-nums", // equal-width digits
                fontFeatureSettings: '"tnum" 1, "lnum" 1',
                whiteSpace: "nowrap",
                transform: `skewX(-${textSlantDeg}deg)`, // italic slant on the digits themselves
                transformOrigin: "center",
                display: "inline-flex",
                alignItems: "flex-end",
                ...fontStyle,
                fontSize: numberFontSize,
            }}
        >
            <span style={{ display: "inline-flex", alignItems: "flex-end" }}>
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
            {/* The thousands portion ("12,345" → ",345") at smaller size */}
            {minor ? (
                <span
                    style={{
                        fontSize: minorFontSize,
                        lineHeight: 0.92,
                        display: "inline-flex",
                        alignItems: "flex-end",
                        transform: "translateY(-0.03em)", // align baseline visually
                        marginLeft: "0.01em",
                    }}
                >
                    <span style={{ display: "inline-flex", justifyContent: "center" }}>,</span>
                    {currentMinorSlots.map((char, index) =>
                        renderSlot(
                            char,
                            previousMinorSlots[index] ?? null,
                            // Continue the slot index counter from the major
                            // section so slotDelay sees one continuous wave.
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

// ==================== COMPONENT ====================
//
// @framerSupportedLayoutWidth fixed
// @framerSupportedLayoutHeight auto
// @framerIntrinsicWidth 140
// @framerIntrinsicHeight 50

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

    // ---- 1. Resolve the rating value ----
    // Source priority: live > canvas preview > waiting (null).

    const data = usePremierRatingData()
    const liveRating: number | null =
        typeof data?.premierRating === "number" ? data.premierRating : null

    const renderTarget = RenderTarget.current()
    const isCanvas =
        renderTarget === RenderTarget.canvas || renderTarget === RenderTarget.thumbnail

    const rating: number | null =
        usePreviewOnCanvas && isCanvas
            ? previewValue
            : liveRating !== null
                ? liveRating
                : null

    // ---- 2. Format and run the change animation ----

    const displayText = rating !== null ? formatRating(rating) : fallbackText

    const transitionState = useRankChangeDisplay(
        displayText,
        animateNumber,
        animateDuration,
        Math.ceil(maxSlotDelay(displayText) * 1000)
    )

    // ---- 3. Compute layout based on font size ----

    // Use the displayed (possibly mid-roll) value to pick the tier so colors
    // track the visible number, not the target. This means the gradient
    // crossfade aligns with when the digits actually settle on the new tier.
    const visibleTierText =
        transitionState.animationActive && transitionState.previousText !== null
            ? transitionState.previousText
            : transitionState.currentText
    const currentTier = getTier(parseRatingNumber(visibleTierText) ?? rating ?? 0)

    const fontStyle = numberFont ?? {}
    const numberFontSize =
        typeof fontStyle.fontSize === "number"
            ? fontStyle.fontSize
            : Number.parseFloat(String(fontStyle.fontSize ?? 28)) || 28

    const stripeOpacities = [1, 0.82, 0.6] // three stripes, decreasing prominence
    const dimensions = getBadgeDimensions(numberFontSize)
    const rollDurationSeconds = animateDuration / 1000

    // Width of the left "stripe rail" — used to push the number container
    // away from the stripes so digits don't overlap them.
    const stripeRailWidth =
        dimensions.leftRailPadding +
        stripeOpacities.length * dimensions.stripeWidth +
        Math.max(0, stripeOpacities.length - 1) * dimensions.stripeGap

    const tierTransition = {
        duration: rollDurationSeconds,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    }

    // ---- 4. Trigger the sweep flash on rank change ----
    // The flash is a separate div that re-mounts (via key change) to replay
    // its CSS animation. We don't trigger on first paint or fallback states.

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

    // ---- 5. Render ----

    return (
        <div style={{ width: dimensions.width, height: dimensions.height }}>
            <style>{`
                @keyframes cs2-flash { 0% { opacity: 0; } 14% { opacity: 1; } 100% { opacity: 0; } }
            `}</style>

            {/* Outer wrapper — preserves layout dimensions */}
            <div
                style={{
                    position: "relative",
                    width: dimensions.width,
                    height: dimensions.height,
                }}
            >
                {/* Skewed body — the parallelogram badge. Everything inside
                    inherits the skew unless explicitly counter-skewed. */}
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        transform: `skewX(-${slantDeg}deg)`,
                        borderRadius: dimensions.borderRadius,
                        overflow: "hidden",
                    }}
                >
                    {/* Animated background layer.
                        framer-motion interpolates linear-gradient strings as
                        long as the from/to gradients have matching structure
                        (same stop count, same units). All seven tiers share
                        the 3-stop 0%/52%/100% structure so this works. */}
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
                        {/* Diagonal gloss highlight — purely cosmetic */}
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
                        {/* Bottom darkening — adds depth */}
                        <div
                            style={{
                                position: "absolute",
                                inset: 0,
                                pointerEvents: "none",
                                background:
                                    "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 52%, rgba(0,0,0,0.22) 100%)",
                            }}
                        />
                        {/* Three vertical stripes on the left edge — the
                            tier signature in the in-game badge. Decreasing
                            opacity creates the depth-stagger effect. */}
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

                    {/* Number container — counter-skews so digits read upright
                        against the slanted badge. The stripeRailWidth spacer
                        on the left reserves space the stripes occupy so the
                        number stays centered in the remaining area. */}
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                        }}
                    >
                        <div style={{ width: stripeRailWidth, flexShrink: 0 }} />
                        <div
                            style={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transform: `skewX(${slantDeg}deg)`, // counter-skew
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

                    {/* Sweep flash — re-mounts via key change to replay the
                        CSS keyframe each time the displayed value changes. */}
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

// FIX: set displayName so Framer's Layers panel and dev tools label this
// component cleanly instead of showing "Component" or the function name.
CS2PremierRank.displayName = "CS2 Premier Rank"

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
    fallbackText: {
        type: ControlType.String,
        title: "Fallback",
        defaultValue: "—",
    },

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
