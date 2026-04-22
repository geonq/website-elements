import { useEffect, useState, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"

/**
 * SpotifyNowPlaying — Perlin-noise driven waveform
 *
 * ========== TUNING GUIDE ==========
 * Framer sidebar (no code edit):
 *   Collapsed/Expanded W/H, Bars, Album Accent, colors
 *
 * In-code TUNE: constants (search file):
 *   innerPadding, albumBorderRadius, barGap, textGap
 *   expansionDuration, hoverFadeDuration
 *   spatialFreq, temporalFreq, envelopeSigma, swingAmount
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
        collapsedWidth,
        collapsedHeight,
        expandedWidth,
        expandedHeight,
    } = props

    const [data, setData] = useState(null)
    const [hovered, setHovered] = useState(false)
    const [progress, setProgress] = useState(0)
    const [extractedColor, setExtractedColor] = useState(null)
    const progressBaseRef = useRef({ serverProgress: 0, fetchedAt: 0 })
    const lastArtUrlRef = useRef(null)

    // Refs to each bar DOM node — so we can animate them directly,
    // bypassing React's render cycle for the waveform.
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

    // ---- Album color extraction (unchanged from before) ----
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
                    const r = pixels[i]
                    const g = pixels[i + 1]
                    const b = pixels[i + 2]
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

    // ---- Hash for per-song parameter variation ----
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

    // ---- TUNE: spacing and motion parameters ----
    const innerPadding = 6
    const albumBorderRadius = 6
    const barGap = 2
    const textGap = 2
    const expansionDuration = 0.4
    const hoverFadeDuration = 0.3

    // TUNE: noise parameters. These shape the look of the motion.
    //   spatialFreq: how rapidly the noise varies across bars.
    //     Lower (0.15) = smoother neighbor correlation, longer waves
    //     Higher (0.4) = more chaotic, tighter ripples
    //   temporalFreq: how fast the pattern evolves. Scaled by BPM.
    //   envelopeSigma: width of the bell curve. Larger = wider peak.
    //   swingAmount: how much bars can deviate from rest (0..1).
    const spatialFreq = 0.22 + ((trackHash >> 4) % 10) / 60 // per-song 0.22–0.38
    const temporalFreq = (effectiveBpm / 120) * 0.6 // beats-per-minute scaled
    const envelopeSigma = 0.42
    const swingAmount = 1.0
    // ------------------------------------------------

    const albumSize = collapsedHeight - innerPadding * 2
    const waveRowHeight = collapsedHeight - innerPadding * 2
    const center = (barCount - 1) / 2

    // Resting (idle) height per bar — the bell-curve shape
    const envelopeAt = (i) => {
        const dist = Math.abs(i - center) / center
        return Math.exp(-(dist * dist) / (2 * envelopeSigma * envelopeSigma))
    }

    // ---- Animation loop ----
    useEffect(() => {
        if (!isPlaying) {
            // When paused, set bars to their rest height and stop the loop
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            barRefs.current.forEach((el, i) => {
                if (!el) return
                const env = envelopeAt(i)
                const restHeight = waveRowHeight * (0.15 + env * 0.35)
                el.style.height = `${restHeight}px`
            })
            return
        }

        // Perlin-like 1D noise with per-song seed
        // (hashed gradients give different motion signatures per song)
        const seed = trackHash >>> 0
        const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)
        const lerp = (a, b, t) => a + t * (b - a)
        const grad = (hashVal, x) => {
            // Map hash to one of a few gradients, scale by x
            const h = hashVal & 15
            const g = 1 + (h & 7) // 1..8
            return (h & 8 ? -g : g) * x
        }
        const hashAt = (i) => {
            // Simple integer hash seeded by trackHash
            let x = (i + seed) | 0
            x = x ^ 61 ^ (x >>> 16)
            x = (x + (x << 3)) | 0
            x = x ^ (x >>> 4)
            x = Math.imul(x, 0x27d4eb2d)
            x = x ^ (x >>> 15)
            return x >>> 0
        }
        const noise1D = (x) => {
            const x0 = Math.floor(x)
            const x1 = x0 + 1
            const t = fade(x - x0)
            const n0 = grad(hashAt(x0), x - x0)
            const n1 = grad(hashAt(x1), x - x1)
            // Normalize roughly to [-1, 1]
            return lerp(n0, n1, t) / 8
        }

        const startTime = performance.now()

        const frame = () => {
            const now = performance.now()
            const t = (now - startTime) / 1000 // seconds
            const timeOffset = t * temporalFreq

            for (let i = 0; i < barCount; i++) {
                const el = barRefs.current[i]
                if (!el) continue

                // Sample noise at this bar's spatial position + current time offset
                const n = noise1D(i * spatialFreq + timeOffset)
                // Map from [-1, 1] to [0, 1]
                const nNormalized = (n + 1) / 2

                // Apply the envelope — middle bars have full swing, edges barely move
                const env = envelopeAt(i)
                const minH = waveRowHeight * 0.1
                const maxH = waveRowHeight * 1.0

                // Rest height — minimal, bell-curve shaped.
                // Edge bars rest at ~8%, center bars rest at ~22%.
                const restFactor = 0.08 + env * 0.14
                // Swing range — how much headroom this bar has above its rest.
                // Edge bars: very little (env near 0 = no swing).
                // Center bars: can reach the full max.
                const swingRange = env * swingAmount
                // nNormalized is 0..1 from the noise, so swing adds 0 to swingRange.
                const factor = restFactor + swingRange * nNormalized

                const height = minH + (maxH - minH) * Math.min(1, factor)
                el.style.height = `${height}px`
            }

            rafRef.current = requestAnimationFrame(frame)
        }

        rafRef.current = requestAnimationFrame(frame)

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
        }
    }, [
        isPlaying,
        trackHash,
        barCount,
        waveRowHeight,
        spatialFreq,
        temporalFreq,
        envelopeSigma,
        swingAmount,
    ])

    const currentWidth = hovered ? expandedWidth : collapsedWidth
    const currentHeight = hovered ? expandedHeight : collapsedHeight

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
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    width: currentWidth,
                    height: currentHeight,
                    background: backgroundColor,
                    borderRadius: collapsedHeight / 2,
                    position: "relative",
                    overflow: "hidden",
                    transition: `width ${expansionDuration}s cubic-bezier(0.4, 0, 0.2, 1), height ${expansionDuration}s cubic-bezier(0.4, 0, 0.2, 1), border-radius ${expansionDuration}s cubic-bezier(0.4, 0, 0.2, 1)`,
                    fontFamily:
                        "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
                    boxShadow: hovered
                        ? "0 10px 40px rgba(0,0,0,0.4)"
                        : "0 4px 12px rgba(0,0,0,0.25)",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: collapsedHeight,
                        padding: innerPadding,
                        boxSizing: "border-box",
                        display: "flex",
                        alignItems: "center",
                        gap: innerPadding,
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
                                isPlaying && data.album_art_url
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

                    {/* Waveform — heights are driven by the rAF loop above */}
                    <div
                        style={{
                            flex: 1,
                            height: waveRowHeight,
                            display: "flex",
                            alignItems: "center",
                            gap: barGap,
                            opacity: hovered ? 0 : 1,
                            transition: `opacity ${hoverFadeDuration * 0.6}s ease`,
                            minWidth: 0,
                        }}
                    >
                        {Array.from({ length: barCount }).map((_, i) => (
                            <div
                                key={i}
                                ref={(el) => (barRefs.current[i] = el)}
                                style={{
                                    flex: 1,
                                    height: `${waveRowHeight * 0.3}px`, // initial before rAF kicks in
                                    background: isPlaying ? accent : mutedColor,
                                    opacity: isPlaying ? 1 : 0.3,
                                    borderRadius: 1,
                                    // Smooth the per-frame height updates visually
                                    transition:
                                        "height 0.08s linear, background 0.4s ease",
                                }}
                            />
                        ))}
                    </div>

                    {/* Song title overlay */}
                    <div
                        style={{
                            position: "absolute",
                            top: 0,
                            left: albumSize + innerPadding * 2,
                            right: innerPadding,
                            height: collapsedHeight,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            gap: textGap,
                            opacity: hovered ? 1 : 0,
                            transition: `opacity ${hoverFadeDuration}s ease ${hoverFadeDuration * 0.5}s`,
                            pointerEvents: "none",
                            minWidth: 0,
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
                            }}
                        >
                            <span
                                style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: "50%",
                                    background: isPlaying ? accent : mutedColor,
                                    boxShadow: isPlaying
                                        ? `0 0 6px ${accent}`
                                        : "none",
                                }}
                            />
                            {isPlaying ? "Now Playing" : "Not Listening"}
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
                            {isPlaying ? data.song : "Silence"}
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
                            {isPlaying ? data.artist : "—"}
                        </div>
                    </div>
                </div>

                {/* Bottom area — progress bar + timestamps */}
                <div
                    style={{
                        position: "absolute",
                        top: collapsedHeight,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        padding: `${innerPadding}px ${innerPadding * 2}px ${innerPadding * 2}px ${innerPadding * 2}px`,
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                        gap: 6,
                        opacity: hovered ? 1 : 0,
                        transition: `opacity ${hoverFadeDuration}s ease ${hoverFadeDuration * 0.5}s`,
                        pointerEvents: "none",
                    }}
                >
                    {isPlaying && (
                        <>
                            <div
                                style={{
                                    height: 3,
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
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontSize: 10,
                                    color: mutedColor,
                                    fontVariantNumeric: "tabular-nums",
                                }}
                            >
                                <span>{fmt(elapsedMs)}</span>
                                <span>{fmt(data.duration_ms)}</span>
                            </div>
                        </>
                    )}
                </div>
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
    collapsedWidth: {
        type: ControlType.Number,
        title: "Collapsed W",
        defaultValue: 260,
        min: 120,
        max: 500,
        step: 10,
    },
    collapsedHeight: {
        type: ControlType.Number,
        title: "Collapsed H",
        defaultValue: 40,
        min: 28,
        max: 80,
        step: 2,
    },
    expandedWidth: {
        type: ControlType.Number,
        title: "Expanded W",
        defaultValue: 340,
        min: 200,
        max: 600,
        step: 10,
    },
    expandedHeight: {
        type: ControlType.Number,
        title: "Expanded H",
        defaultValue: 110,
        min: 60,
        max: 200,
        step: 4,
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
        defaultValue: 22,
        min: 10,
        max: 60,
        step: 1,
    },
})
