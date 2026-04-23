import { useEffect, useState, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"

/**
 * SpotifyNowPlaying — Dynamic Island w/ collapsing waveform
 *
 * ========== TUNING GUIDE ==========
 * Framer sidebar:
 *   collapsedHeight, collapsedPlayingWidth, collapsedIdleWidth,
 *   maxExpandedWidth, Bars, Album Accent, colors
 *
 * In-code TUNE: constants (search file):
 *   outerPaddingX/Y, albumTextGap, textGap, barGap,
 *   expansionDuration (master timing), hoverFadeDuration,
 *   spatialFreq, swingAmount, envelopeSigma
 * ===================================
 */
export default function SpotifyNowPlaying(props) {
    const {
        workerUrl,
        accentColor: accentColorProp,
        useAlbumColor,
        backgroundColor,
        textColor,
        mutedColor,
        barCount,
        pollInterval,
        collapsedPlayingWidth,
        collapsedIdleWidth,
        collapsedHeight,
        maxExpandedWidth,
    } = props

    const [data, setData] = useState(null)
    const [hovered, setHovered] = useState(false)
    const [progress, setProgress] = useState(0)
    const [extractedColor, setExtractedColor] = useState(null)
    const progressBaseRef = useRef({ serverProgress: 0, fetchedAt: 0 })
    const lastArtUrlRef = useRef(null)
    const barRefs = useRef([])
    const rafRef = useRef(null)

    // ---- Poll the Worker ----
    useEffect(() => {
        if (!workerUrl) return
        let cancelled = false
        const poll = async () => {
            try {
                const res = await fetch(workerUrl, { cache: "no-store" })
                const json = await res.json()
                if (cancelled) return
                setData(json)
                if (json.is_playing && typeof json.progress_ms === "number") {
                    progressBaseRef.current = {
                        serverProgress: json.progress_ms,
                        fetchedAt: Date.now(),
                    }
                }
            } catch (err) {
                console.error("[Spotify] poll failed:", err)
            }
        }
        poll()
        const interval = setInterval(poll, pollInterval * 1000)
        return () => {
            cancelled = true
            clearInterval(interval)
        }
    }, [workerUrl, pollInterval])

    // ---- Progress ticker ----
    useEffect(() => {
        if (!data?.is_playing) {
            setProgress(0)
            return
        }
        const tick = () => {
            const { serverProgress, fetchedAt } = progressBaseRef.current
            const elapsed = Date.now() - fetchedAt
            const currentMs = serverProgress + elapsed
            const pct = Math.min(
                100,
                Math.max(0, (currentMs / data.duration_ms) * 100)
            )
            setProgress(pct)
        }
        tick()
        const id = setInterval(tick, 500)
        return () => clearInterval(id)
    }, [data])

    // ---- Album color extraction ----
    useEffect(() => {
        if (!useAlbumColor) {
            setExtractedColor(null)
            return
        }
        const url = data?.album_art_url
        if (!url || url === lastArtUrlRef.current) return
        lastArtUrlRef.current = url

        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas")
                const size = 32
                canvas.width = size
                canvas.height = size
                const ctx = canvas.getContext("2d")
                if (!ctx) return
                ctx.drawImage(img, 0, 0, size, size)
                const { data: pixels } = ctx.getImageData(0, 0, size, size)

                let bestR = 128,
                    bestG = 128,
                    bestB = 128
                let bestScore = -1

                for (let i = 0; i < pixels.length; i += 4) {
                    const r = pixels[i],
                        g = pixels[i + 1],
                        b = pixels[i + 2]
                    const a = pixels[i + 3]
                    if (a < 200) continue
                    const max = Math.max(r, g, b)
                    const min = Math.min(r, g, b)
                    const lum = (max + min) / 2 / 255
                    const sat = max === 0 ? 0 : (max - min) / max
                    const lumFactor = 1 - Math.abs(lum - 0.55) * 1.5
                    const score = sat * Math.max(lumFactor, 0.1)
                    if (score > bestScore) {
                        bestScore = score
                        bestR = r
                        bestG = g
                        bestB = b
                    }
                }
                const boost = (c) => Math.min(255, Math.round(c * 1.1))
                setExtractedColor(
                    `rgb(${boost(bestR)}, ${boost(bestG)}, ${boost(bestB)})`
                )
            } catch (err) {
                setExtractedColor(null)
            }
        }
        img.onerror = () => setExtractedColor(null)
        img.src = url
    }, [data?.album_art_url, useAlbumColor])

    const isPlaying = data?.is_playing
    const fmt = (ms) => {
        const s = Math.floor(ms / 1000)
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
    }
    const elapsedMs = isPlaying
        ? progressBaseRef.current.serverProgress +
          (Date.now() - progressBaseRef.current.fetchedAt)
        : 0

    const accent =
        useAlbumColor && extractedColor ? extractedColor : accentColorProp

    const hash = (str) => {
        let h = 0
        for (let i = 0; i < (str?.length ?? 0); i++) {
            h = (h * 31 + str.charCodeAt(i)) >>> 0
        }
        return h
    }
    const trackHash = hash(data?.track_id ?? "")
    const pseudoBpm = 85 + (trackHash % 70)
    const realBpm = data?.bpm > 0 ? data.bpm : null
    const effectiveBpm = realBpm ?? pseudoBpm

    // ---- TUNE: timing and spacing ----
    const expansionDuration = 0.8 // master timing in seconds
    const hoverFadeDuration = 0.5

    const innerPadding = 6
    const outerPaddingX = 14
    const outerPaddingY = 14
    const albumBorderRadius = 6
    const barGap = 2
    const albumTextGap = 12
    const textGap = 3
    const progressBarHeight = 3

    const spatialFreq = 0.22 + ((trackHash >> 4) % 10) / 60
    const temporalFreq = (effectiveBpm / 120) * 0.6
    const envelopeSigma = 0.42
    const swingAmount = 1.0

    // Shared easing curve — used everywhere for consistency
    const easing = "cubic-bezier(0.32, 0.72, 0, 1)"
    // -------------------------------------

    const albumSize = collapsedHeight - innerPadding * 2
    const waveRowHeight = collapsedHeight - innerPadding * 2
    const center = (barCount - 1) / 2

    const envelopeAt = (i) => {
        const dist = Math.abs(i - center) / center
        return Math.exp(-(dist * dist) / (2 * envelopeSigma * envelopeSigma))
    }

    // ---- Animation loop: frequency-clustered Gaussian peaks ----
    useEffect(() => {
        if (!isPlaying) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            const uniformRest = waveRowHeight * 0.08
            barRefs.current.forEach((el) => {
                if (!el) return
                el.style.height = `${uniformRest}px`
            })
            return
        }

        // --- Global Activity Mask ---
        // Indices 0..edgeZone and (barCount-edgeZone)..end ramp from 0 → 1 via
        // smoothstep, so the extreme edges are calm and the center is hot.
        // Scales with barCount so you can tweak bar density later.
        const edgeZone = Math.round(barCount * 0.18) // e.g. 11 bars per side at 60
        const activityMask = new Float32Array(barCount)
        for (let i = 0; i < barCount; i++) {
            let m
            if (i < edgeZone) m = i / edgeZone
            else if (i > barCount - 1 - edgeZone)
                m = (barCount - 1 - i) / edgeZone
            else m = 1
            m = Math.max(0, Math.min(1, m))
            activityMask[i] = m * m * (3 - 2 * m) // smoothstep easing
        }

        // --- State arrays ---
        const barEnergy = new Float32Array(barCount)
        const currentHeights = new Float32Array(barCount)
        const uniformMinH = waveRowHeight * 0.08
        const maxH = waveRowHeight * 1.0
        for (let i = 0; i < barCount; i++) currentHeights[i] = uniformMinH

        // --- TUNE: physics + event scheduling ---
        const heightDecayPerFrame = 0.88 // bar gravity (lower = faster fall)
        const energyDecayPerFrame = 0.9 // how fast the spike energy bleeds off
        const beatsPerSecond = effectiveBpm / 60
        // Event triggers fire ~3.5x per beat with jitter, each firing a burst
        // of 2-3 simultaneous peaks. At 128 BPM that's ~7-10 peaks/second.
        const triggersPerBeat = 3.5
        const burstMin = 2 // min simultaneous peaks per trigger
        const burstMax = 3 // max simultaneous peaks per trigger
        // -----------------------------------------

        // --- Sound event spawner ---
        // Each event = a Gaussian bump of energy centered on some bar.
        // We pick from 3 "bands" with different center distributions, widths,
        // and amplitude ranges, so peaks look like different instruments.
        const centerIdx = (barCount - 1) / 2
        const spawnEvent = (kick) => {
            const roll = Math.random()
            let center, sigma, amplitude
            if (roll < 0.35) {
                // BASS: center-biased, wide cluster (5-7 bars), strong amplitude,
                // boosted by the kick drum
                center = centerIdx + (Math.random() - 0.5) * barCount * 0.25
                sigma = barCount * 0.05 + Math.random() * barCount * 0.04
                amplitude = 0.7 + Math.random() * 0.3
                amplitude *= 1 + kick * 0.4
            } else if (roll < 0.75) {
                // MID: off-center, medium cluster (3-5 bars)
                center = centerIdx + (Math.random() - 0.5) * barCount * 0.55
                sigma = barCount * 0.035 + Math.random() * barCount * 0.025
                amplitude = 0.4 + Math.random() * 0.35
            } else {
                // HIGH: anywhere, narrow cluster (2-3 bars), sharper
                center = edgeZone + Math.random() * (barCount - edgeZone * 2)
                sigma = barCount * 0.02 + Math.random() * barCount * 0.02
                amplitude = 0.3 + Math.random() * 0.3
            }

            const twoSigmaSq = 2 * sigma * sigma
            const radius = Math.ceil(sigma * 3) // ~99% of Gaussian mass
            const start = Math.max(0, Math.floor(center - radius))
            const end = Math.min(barCount - 1, Math.ceil(center + radius))

            for (let i = start; i <= end; i++) {
                const d = i - center
                const falloff = Math.exp(-(d * d) / twoSigmaSq)
                // Multiply by the global activity mask — edges stay calm
                // even if a peak happens to land there
                const contrib = amplitude * falloff * activityMask[i]
                // Take the max so overlapping events don't just average out
                if (contrib > barEnergy[i]) barEnergy[i] = contrib
            }
        }

        // --- Frame loop ---
        const startTime = performance.now()
        let lastFrameTime = startTime
        let nextSpawnAt = 0

        const frame = () => {
            const now = performance.now()
            const t = (now - startTime) / 1000
            const dt = Math.min(50, now - lastFrameTime) / (1000 / 60)
            lastFrameTime = now

            // Master kick for bass amplitude boost
            const beatPhase = (t * beatsPerSecond) % 1
            const kick =
                beatPhase < 0.1
                    ? beatPhase / 0.1
                    : Math.exp(-(beatPhase - 0.1) * 4)

            // --- Trigger sound events on schedule ---
            if (t >= nextSpawnAt) {
                const burstCount =
                    burstMin +
                    Math.floor(Math.random() * (burstMax - burstMin + 1))
                for (let k = 0; k < burstCount; k++) spawnEvent(kick)
                // Schedule next trigger: baseline rate + 60-140% jitter
                const interval = 1 / (beatsPerSecond * triggersPerBeat)
                nextSpawnAt = t + interval * (0.6 + Math.random() * 0.8)
            }

            // --- Resolve bar physics: instant attack, gravity decay, no wobble ---
            const decayK = Math.pow(heightDecayPerFrame, dt)
            const energyK = Math.pow(energyDecayPerFrame, dt)
            for (let i = 0; i < barCount; i++) {
                const el = barRefs.current[i]
                if (!el) continue

                // Target derived purely from energy — no idle noise
                const target =
                    uniformMinH +
                    (maxH - uniformMinH) * Math.min(1, barEnergy[i])

                if (target >= currentHeights[i]) {
                    // Rising: snap (instant attack)
                    currentHeights[i] = target
                } else {
                    // Falling: exponential decay toward baseline (frame-rate independent)
                    currentHeights[i] =
                        uniformMinH + (currentHeights[i] - uniformMinH) * decayK
                    if (currentHeights[i] < uniformMinH)
                        currentHeights[i] = uniformMinH
                }

                // Energy bleeds off so the bar eventually settles back to rest
                barEnergy[i] *= energyK

                el.style.height = `${currentHeights[i]}px`
            }

            rafRef.current = requestAnimationFrame(frame)
        }
        rafRef.current = requestAnimationFrame(frame)
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
        }
    }, [isPlaying, trackHash, barCount, waveRowHeight, effectiveBpm])
    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                position: "relative",
            }}
        >
            <div
                onMouseEnter={() => isPlaying && setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    width: isPlaying ? undefined : collapsedIdleWidth,
                    minWidth: isPlaying
                        ? collapsedPlayingWidth
                        : collapsedIdleWidth,
                    maxWidth:
                        hovered && isPlaying
                            ? maxExpandedWidth
                            : collapsedPlayingWidth,
                    minHeight: collapsedHeight,
                    maxHeight: hovered && isPlaying ? 220 : collapsedHeight,
                    background: backgroundColor,
                    borderRadius: collapsedHeight / 2,
                    position: "relative",
                    overflow: "hidden",
                    transition: [
                        `max-width ${expansionDuration}s ${easing}`,
                        `min-width ${expansionDuration}s ${easing}`,
                        `max-height ${expansionDuration}s ${easing}`,
                        `border-radius ${expansionDuration}s ${easing}`,
                        `box-shadow ${expansionDuration}s ease`,
                    ].join(", "),
                    fontFamily:
                        "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
                    boxShadow: hovered
                        ? "0 10px 40px rgba(0,0,0,0.4)"
                        : "0 4px 12px rgba(0,0,0,0.25)",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                {/* Top strip */}
                <div
                    style={{
                        minHeight: collapsedHeight,
                        padding:
                            hovered && isPlaying
                                ? `${outerPaddingY}px ${outerPaddingX}px 0 ${outerPaddingX}px`
                                : `${innerPadding}px ${outerPaddingX}px ${innerPadding}px ${outerPaddingX}px`,
                        boxSizing: "border-box",
                        display: "flex",
                        alignItems:
                            hovered && isPlaying ? "flex-start" : "center",
                        gap: albumTextGap,
                        flexShrink: 0,
                        transition: `padding ${expansionDuration}s ${easing}`,
                        position: "relative",
                    }}
                >
                    {/* Album art */}
                    <div
                        style={{
                            width: albumSize,
                            height: albumSize,
                            flexShrink: 0,
                            borderRadius: albumBorderRadius,
                            background: mutedColor,
                            backgroundImage:
                                isPlaying && data?.album_art_url
                                    ? `url(${data.album_art_url})`
                                    : "none",
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            position: "relative",
                        }}
                    >
                        {!isPlaying && (
                            <div
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: textColor,
                                    opacity: 0.4,
                                    fontSize: albumSize * 0.5,
                                }}
                            >
                                ♫
                            </div>
                        )}
                    </div>

                    {/* Playing right side */}
                    {isPlaying ? (
                        <div
                            style={{
                                position: "relative",
                                flex: 1,
                                minHeight: waveRowHeight,
                                height: hovered ? "auto" : waveRowHeight,
                                minWidth: 0,
                            }}
                        >
                            {/* Waveform layer — collapses into the progress bar */}
                            <div
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: waveRowHeight,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: barGap,
                                    opacity: hovered ? 0 : 1,
                                    transformOrigin: "center center",
                                    // scaleY(0) collapses height to nothing,
                                    // creating the "flatten into line" effect
                                    transform: hovered
                                        ? "scaleY(0.06)"
                                        : "scaleY(1)",
                                    transition: [
                                        // Scale animation takes the FULL duration
                                        // — matches the pill's expansion
                                        `transform ${expansionDuration}s ${easing}`,
                                        // Opacity only fades in the last ~30%
                                        `opacity ${hoverFadeDuration}s ease ${expansionDuration * 0.5}s`,
                                    ].join(", "),
                                    pointerEvents: hovered ? "none" : "auto",
                                }}
                            >
                                {Array.from({ length: barCount }).map(
                                    (_, i) => (
                                        <div
                                            key={i}
                                            ref={(el) =>
                                                (barRefs.current[i] = el)
                                            }
                                            style={{
                                                flex: 1,
                                                height: `${waveRowHeight * 0.3}px`,
                                                background: accent,
                                                opacity: 1,
                                                borderRadius: 1,
                                                transition:
                                                    "background 0.4s ease",
                                            }}
                                        />
                                    )
                                )}
                            </div>

                            {/* Text layer — fades in with delay */}
                            <div
                                style={{
                                    position: hovered ? "relative" : "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: hovered
                                        ? "flex-start"
                                        : "center",
                                    gap: textGap,
                                    minWidth: 140,
                                    paddingRight: innerPadding,
                                    opacity: hovered ? 1 : 0,
                                    transform: hovered
                                        ? "translateY(0)"
                                        : "translateY(4px)",
                                    transition: [
                                        `opacity ${hoverFadeDuration}s ease ${expansionDuration * 0.35}s`,
                                        `transform ${hoverFadeDuration}s ${easing} ${expansionDuration * 0.35}s`,
                                    ].join(", "),
                                    pointerEvents: hovered ? "auto" : "none",
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 9,
                                        textTransform: "uppercase",
                                        letterSpacing: 1.4,
                                        color: mutedColor,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 5,
                                        lineHeight: 1,
                                    }}
                                >
                                    <span
                                        style={{
                                            width: 5,
                                            height: 5,
                                            borderRadius: "50%",
                                            background: accent,
                                            boxShadow: `0 0 6px ${accent}`,
                                        }}
                                    />
                                    Now Playing
                                </div>
                                <div
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: textColor,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        lineHeight: 1.2,
                                    }}
                                >
                                    {data.song}
                                </div>
                                <div
                                    style={{
                                        fontSize: 11,
                                        color: mutedColor,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        lineHeight: 1.2,
                                    }}
                                >
                                    {data.artist}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div
                            style={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 10,
                                textTransform: "uppercase",
                                letterSpacing: 1.3,
                                color: mutedColor,
                                paddingRight: innerPadding,
                            }}
                        >
                            <span
                                style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: "50%",
                                    background: mutedColor,
                                    flexShrink: 0,
                                }}
                            />
                            Not Listening
                        </div>
                    )}
                </div>

                {/* Progress bar + timestamps — unfurl from below */}
                {isPlaying && (
                    <div
                        style={{
                            padding: `0 ${outerPaddingX}px ${hovered ? outerPaddingY * 0.85 : 0}px ${outerPaddingX}px`,
                            boxSizing: "border-box",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            marginTop: hovered ? 10 : 0,
                            maxHeight: hovered ? 60 : 0,
                            opacity: hovered ? 1 : 0,
                            overflow: "hidden",
                            // Asymmetric: on hover IN, max-height expands immediately.
                            // On hover OUT, opacity fades first, then max-height collapses with a delay.
                            transition: hovered
                                ? [
                                      `max-height ${expansionDuration}s ${easing}`,
                                      `margin-top ${expansionDuration}s ${easing}`,
                                      `padding ${expansionDuration}s ${easing}`,
                                      `opacity ${hoverFadeDuration * 0.6}s ease ${expansionDuration * 0.55}s`,
                                  ].join(", ")
                                : [
                                      `max-height ${expansionDuration}s ${easing} 0.2s`,
                                      `margin-top ${expansionDuration}s ${easing} 0.2s`,
                                      `padding ${expansionDuration}s ${easing} 0.2s`,
                                      `opacity 0.25s ease`,
                                  ].join(", "),
                        }}
                    >
                        {/* Progress line — parent container controls opacity */}
                        <div
                            style={{
                                height: progressBarHeight,
                                background: mutedColor,
                                borderRadius: 2,
                                overflow: "hidden",
                                opacity: 0.4,
                            }}
                        >
                            <div
                                style={{
                                    height: "100%",
                                    width: `${progress}%`,
                                    background: accent,
                                    transition: "width 0.5s linear",
                                }}
                            />
                        </div>
                        {/* Timestamps — parent container controls opacity */}
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: 10,
                                color: mutedColor,
                                fontVariantNumeric: "tabular-nums",
                                lineHeight: 1,
                            }}
                        >
                            <span>{fmt(elapsedMs)}</span>
                            <span>{fmt(data.duration_ms)}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

addPropertyControls(SpotifyNowPlaying, {
    workerUrl: {
        type: ControlType.String,
        title: "Worker URL",
        defaultValue: "",
        placeholder: "https://your-worker.workers.dev",
    },
    pollInterval: {
        type: ControlType.Number,
        title: "Poll (sec)",
        defaultValue: 10,
        min: 5,
        max: 60,
        step: 1,
    },
    collapsedHeight: {
        type: ControlType.Number,
        title: "Pill Height",
        defaultValue: 40,
        min: 28,
        max: 80,
        step: 2,
    },
    collapsedPlayingWidth: {
        type: ControlType.Number,
        title: "W (Playing)",
        defaultValue: 260,
        min: 120,
        max: 500,
        step: 10,
    },
    collapsedIdleWidth: {
        type: ControlType.Number,
        title: "W (Idle)",
        defaultValue: 150,
        min: 80,
        max: 300,
        step: 10,
    },
    maxExpandedWidth: {
        type: ControlType.Number,
        title: "Max Expanded W",
        defaultValue: 380,
        min: 200,
        max: 700,
        step: 10,
    },
    useAlbumColor: {
        type: ControlType.Boolean,
        title: "Album Accent",
        defaultValue: true,
        enabledTitle: "On",
        disabledTitle: "Off",
    },
    accentColor: {
        type: ControlType.Color,
        title: "Accent (fallback)",
        defaultValue: "#FFFFFF",
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#000000",
    },
    textColor: {
        type: ControlType.Color,
        title: "Text",
        defaultValue: "#FAFAFA",
    },
    mutedColor: {
        type: ControlType.Color,
        title: "Muted",
        defaultValue: "#52525B",
    },
    barCount: {
        type: ControlType.Number,
        title: "Bars",
        defaultValue: 60,
        min: 10,
        max: 100,
        step: 1,
    },
})
