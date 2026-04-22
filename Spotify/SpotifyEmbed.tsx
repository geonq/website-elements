import { useEffect, useState, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"

/**
 * SpotifyNowPlaying — iOS Dynamic Island style, symmetric expansion,
 * album-art-driven accent color.
 *
 * ========== TUNING GUIDE ==========
 * All spacing/size values are in the addPropertyControls block at the bottom
 * (adjust them live in Framer's sidebar), OR in these internal constants:
 *
 *   innerPadding           — padding inside the pill (default 6)
 *   albumBorderRadius      — album art corner rounding (default 6)
 *   barGap                 — gap between waveform bars (default 2)
 *   textGap                — vertical space between text lines (default 2)
 *   bottomPaddingMultiplier — extra padding around progress bar (default 2x)
 *   expansionDuration      — transition speed in seconds (default 0.4)
 *   hoverFadeDuration      — text/wave crossfade speed (default 0.3)
 *
 * Search the file for `// TUNE:` comments to find each one.
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

    // ---- Extract dominant color from album art ----
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
                // Downscale for speed — 32x32 is plenty for color sampling
                const size = 32
                canvas.width = size
                canvas.height = size
                const ctx = canvas.getContext("2d")
                if (!ctx) return
                ctx.drawImage(img, 0, 0, size, size)
                const { data: pixels } = ctx.getImageData(0, 0, size, size)

                // Find the most "vibrant" color:
                // score = saturation * (1 - distance_from_mid_brightness)
                // This avoids both muddy neutrals and pure white/black.
                let bestR = 128,
                    bestG = 128,
                    bestB = 128
                let bestScore = -1

                for (let i = 0; i < pixels.length; i += 4) {
                    const r = pixels[i]
                    const g = pixels[i + 1]
                    const b = pixels[i + 2]
                    const a = pixels[i + 3]
                    if (a < 200) continue // skip transparent

                    const max = Math.max(r, g, b)
                    const min = Math.min(r, g, b)
                    const lum = (max + min) / 2 / 255 // 0..1
                    const sat = max === 0 ? 0 : (max - min) / max // 0..1
                    // Penalize very dark and very bright
                    const lumFactor = 1 - Math.abs(lum - 0.55) * 1.5
                    const score = sat * Math.max(lumFactor, 0.1)

                    if (score > bestScore) {
                        bestScore = score
                        bestR = r
                        bestG = g
                        bestB = b
                    }
                }

                // Boost the color a bit if it came out muted
                const boost = (c) => Math.min(255, Math.round(c * 1.1))
                setExtractedColor(
                    `rgb(${boost(bestR)}, ${boost(bestG)}, ${boost(bestB)})`
                )
            } catch (err) {
                console.warn("[Color] extraction failed:", err)
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

    // ---- Effective accent color (extracted or manual override) ----
    const accent =
        useAlbumColor && extractedColor ? extractedColor : accentColorProp

    // ---- Deterministic animation ----
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
    const beatDuration = 60 / effectiveBpm
    const barAnimDuration = beatDuration / 2

    // ---- TUNE: internal spacing constants ----
    const innerPadding = 6 // padding inside the pill
    const albumBorderRadius = 6 // album art corner rounding
    const barGap = 2 // gap between bars
    const textGap = 2 // gap between text lines
    const bottomPaddingMultiplier = 2 // bottom area padding = innerPadding * this
    const expansionDuration = 0.4 // seconds for size transition
    const hoverFadeDuration = 0.3 // seconds for opacity crossfades
    // --------------------------------------------

    const albumSize = collapsedHeight - innerPadding * 2
    const waveRowHeight = collapsedHeight - innerPadding * 2
    const center = (barCount - 1) / 2
    const maxBarHeight = waveRowHeight * 0.9
    const minBarHeight = waveRowHeight * 0.15

    const heightAt = (i) => {
        const dist = Math.abs(i - center) / center
        const curve = Math.exp(-2.5 * dist * dist)
        return minBarHeight + (maxBarHeight - minBarHeight) * curve
    }

    const currentWidth = hovered ? expandedWidth : collapsedWidth
    const currentHeight = hovered ? expandedHeight : collapsedHeight

    return (
        // Outer wrapper — centers the pill inside whatever frame it lives in.
        // TUNE: changed from `alignItems: flex-start` to `center` for symmetric expansion.
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
                    // TUNE: expansionDuration controls animation speed
                    transition: `width ${expansionDuration}s cubic-bezier(0.4, 0, 0.2, 1), height ${expansionDuration}s cubic-bezier(0.4, 0, 0.2, 1), border-radius ${expansionDuration}s cubic-bezier(0.4, 0, 0.2, 1)`,
                    fontFamily:
                        "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
                    boxShadow: hovered
                        ? "0 10px 40px rgba(0,0,0,0.4)"
                        : "0 4px 12px rgba(0,0,0,0.25)",
                }}
            >
                {/* Top strip — always the same height, pinned to top */}
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

                    {/* Waveform */}
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
                        {Array.from({ length: barCount }).map((_, i) => {
                            const barHeightPx = heightAt(i)
                            const phase =
                                (((trackHash + i * 97) % 100) / 100) *
                                barAnimDuration
                            const animIdx = (trackHash + i) % 4

                            return (
                                <div
                                    key={i}
                                    style={{
                                        flex: 1,
                                        height: `${barHeightPx}px`,
                                        background: isPlaying
                                            ? accent
                                            : mutedColor,
                                        opacity: isPlaying ? 1 : 0.3,
                                        borderRadius: 1,
                                        transformOrigin: "center",
                                        animation: isPlaying
                                            ? `wave-${animIdx} ${barAnimDuration}s ease-in-out ${phase}s infinite alternate`
                                            : "none",
                                        transform: isPlaying
                                            ? undefined
                                            : "scaleY(0.5)",
                                    }}
                                />
                            )
                        })}
                    </div>

                    {/* Song title + artist — overlays the waveform when hovered */}
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
                                    background: isPlaying
                                        ? accent
                                        : mutedColor,
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
                        padding: `${innerPadding}px ${innerPadding * bottomPaddingMultiplier}px ${innerPadding * bottomPaddingMultiplier}px ${innerPadding * bottomPaddingMultiplier}px`,
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

            <style>{`
                @keyframes wave-0 {
                    0%   { transform: scaleY(0.35); }
                    100% { transform: scaleY(1); }
                }
                @keyframes wave-1 {
                    0%   { transform: scaleY(0.55); }
                    100% { transform: scaleY(0.9); }
                }
                @keyframes wave-2 {
                    0%   { transform: scaleY(0.25); }
                    100% { transform: scaleY(1); }
                }
                @keyframes wave-3 {
                    0%   { transform: scaleY(0.7); }
                    100% { transform: scaleY(0.35); }
                }
            `}</style>
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