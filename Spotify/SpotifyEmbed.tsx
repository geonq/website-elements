import { useEffect, useRef, useState } from "react"
import { addPropertyControls, ControlType } from "framer"

const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif"

const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

const hash = (str: string) => {
    let h = 0
    for (let i = 0; i < (str?.length ?? 0); i++) {
        h = (h * 31 + str.charCodeAt(i)) >>> 0
    }
    return h
}

const withAlpha = (color: string | undefined, alpha: number): string => {
    if (!color) return `rgba(255,255,255,${alpha})`
    if (color.startsWith("#")) {
        let hex = color.slice(1)
        if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("")
        if (hex.length === 8) hex = hex.slice(0, 6)
        if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16)
            const g = parseInt(hex.slice(2, 4), 16)
            const b = parseInt(hex.slice(4, 6), 16)
            return `rgba(${r}, ${g}, ${b}, ${alpha})`
        }
    }
    const m = color.match(/rgba?\(([^)]+)\)/i)
    if (m) {
        const parts = m[1].split(",").map((p) => p.trim())
        if (parts.length >= 3) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`
    }
    return color
}

const parseShadowRGBA = (color: string | undefined) => {
    if (!color) return null
    if (color.startsWith("#")) {
        let hex = color.slice(1)
        if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("")
        if (hex.length === 8) return {
            r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16), a: parseInt(hex.slice(6, 8), 16) / 255,
        }
        if (hex.length === 6) return {
            r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16), a: 1,
        }
    }
    const m = color.match(/rgba?\(([^)]+)\)/i)
    if (m) {
        const p = m[1].split(",")
        return { r: +p[0], g: +p[1], b: +p[2], a: p.length >= 4 ? +p[3] : 1 }
    }
    return null
}

const resolveColorToCss = (color: string): string => {
    if (!color || typeof document === "undefined") return color
    if (!color.trim().startsWith("var(")) return color
    const div = document.createElement("div")
    div.style.color = color
    div.style.position = "absolute"
    div.style.visibility = "hidden"
    document.body.appendChild(div)
    const computed = getComputedStyle(div).color
    document.body.removeChild(div)
    return computed || color
}

const isCoarsePointer = () =>
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches

let _measureCanvas: HTMLCanvasElement | null = null
const measureTextWidth = (text: string, fontSize: number, fontWeight = 400, letterSpacing = 0): number => {
    const content = text?.trim?.() ?? ""
    if (!content) return 0
    const fallbackWidth = content.length * fontSize * 0.58 + Math.max(0, content.length - 1) * letterSpacing
    if (typeof document === "undefined") return fallbackWidth
    if (!_measureCanvas) _measureCanvas = document.createElement("canvas")
    const ctx = _measureCanvas.getContext("2d")
    if (!ctx) return fallbackWidth
    ctx.font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`
    return ctx.measureText(content).width + Math.max(0, content.length - 1) * letterSpacing
}

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
 *   shellExpandDuration, shellCollapseDuration,
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
        shadowColorLight,
        shadowColorDark,
        shadowBlur,
        notListeningColor,
        albumPlaceholderColor,
        expandedTextColor,
    } = props

    const [data, setData] = useState(null)
    const [progress, setProgress] = useState(0)
    const [extractedColor, setExtractedColor] = useState(null)
    const [hoverPhase, setHoverPhase] = useState("collapsed")
    const [themeMode, setThemeMode] = useState("dark")

    useEffect(() => {
        const update = () => setThemeMode(
            document.documentElement.getAttribute("data-theme") || "dark"
        )
        update()
        const obs = new MutationObserver(update)
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
        return () => obs.disconnect()
    }, [])


    const progressBaseRef = useRef({ serverProgress: 0, fetchedAt: 0 })
    const lastArtUrlRef = useRef(null)
    const barRefs = useRef([])
    const rafRef = useRef(null)
    const hoverTimerRef = useRef(null)

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

                let bestR = 128
                let bestG = 128
                let bestB = 128
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

                const boost = (channel) =>
                    Math.min(255, Math.round(channel * 1.1))

                const liftDarkColor = (r, g, b) => {
                    const max = Math.max(r, g, b)
                    const min = Math.min(r, g, b)
                    const lightness = (max + min) / 2 / 255

                    if (lightness >= 0.5) return [r, g, b]

                    const mix = (0.5 - lightness) / (1 - lightness)
                    return [r, g, b].map((channel) =>
                        Math.round(channel + (255 - channel) * mix)
                    )
                }

                const [liftedR, liftedG, liftedB] = liftDarkColor(
                    boost(bestR),
                    boost(bestG),
                    boost(bestB)
                )

                setExtractedColor(
                    `rgb(${liftedR}, ${liftedG}, ${liftedB})`
                )
            } catch (err) {
                setExtractedColor(null)
            }
        }

        img.onerror = () => setExtractedColor(null)
        img.src = url
    }, [data?.album_art_url, useAlbumColor])

    const isPlaying = data?.is_playing

    useEffect(() => {
        if (isPlaying) return
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current)
            hoverTimerRef.current = null
        }
        setHoverPhase("collapsed")
    }, [isPlaying])

    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
        }
    }, [])

    const elapsedMs = isPlaying
        ? progressBaseRef.current.serverProgress +
          (Date.now() - progressBaseRef.current.fetchedAt)
        : 0

    const accent =
        useAlbumColor && extractedColor ? extractedColor : accentColorProp

    const accentResolved = resolveColorToCss(accent)

    const trackHash = hash(data?.track_id ?? "")
    const pseudoBpm = 85 + (trackHash % 70)
    const realBpm = data?.bpm > 0 ? data.bpm : null
    const effectiveBpm = realBpm ?? pseudoBpm

    // ---- TUNE: timing and spacing ----
    const shellExpandDuration = 0.76
    const shellCollapseDuration = 0.62
    const shellCollapseDelay = 0.26
    const waveMorphDuration = 0.42
    const waveFadeDuration = 0.32
    const waveReturnDelay = 0.12
    const detailsFadeDuration = 0.34
    const detailsEnterDelay = 0.22
    const progressFadeDuration = 0.38
    const progressEnterDelay = 0.34

    const innerPadding = 6
    const outerPaddingX = 14
    const outerPaddingY = 14
    const expandedTopBottomPadding = 6
    const albumBorderRadius = 6
    const barGap = 2
    const albumTextGap = 12
    const textGap = 3
    const progressBarHeight = 3
    const progressMarginTop = 6
    const progressGap = 6
    const progressBottomPadding = Math.round(outerPaddingY * 0.85)

    const spatialFreq = 0.22 + ((trackHash >> 4) % 10) / 60
    const temporalFreq = (effectiveBpm / 120) * 0.6
    const envelopeSigma = 0.42
    const swingAmount = 1.0

    const easing = "cubic-bezier(0.32, 0.72, 0, 1)"
    // -------------------------------------

    const clearHoverTimer = () => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current)
            hoverTimerRef.current = null
        }
    }

    const expandHoverCard = () => {
        if (!isPlaying) return
        clearHoverTimer()
        setHoverPhase("expanding")
        hoverTimerRef.current = setTimeout(() => {
            setHoverPhase("expanded")
            hoverTimerRef.current = null
        }, Math.round((shellExpandDuration + progressEnterDelay) * 1000))
    }

    const collapseHoverCard = () => {
        if (!isPlaying) {
            setHoverPhase("collapsed")
            return
        }
        clearHoverTimer()
        setHoverPhase("collapsing")
        hoverTimerRef.current = setTimeout(() => {
            setHoverPhase("collapsed")
            hoverTimerRef.current = null
        }, Math.round((shellCollapseDelay + shellCollapseDuration) * 1000))
    }

    const handlePillClick = (e: MouseEvent) => {
        e.stopPropagation()
        if (!isPlaying || !data?.track_id) return
        const spotifyUrl = `https://open.spotify.com/track/${data.track_id}`
        if (!isCoarsePointer()) {
            window.open(spotifyUrl, "_blank", "noopener,noreferrer")
            return
        }
        if (shellElevated) {
            window.open(spotifyUrl, "_blank", "noopener,noreferrer")
        } else {
            expandHoverCard()
        }
    }

    const albumSize = collapsedHeight - innerPadding * 2
    const waveRowHeight = collapsedHeight - innerPadding * 2
    const center = (barCount - 1) / 2

    const labelLineHeight = 11
    const titleLineHeight = 16
    const artistLineHeight = 13
    const metadataHeight =
        labelLineHeight + titleLineHeight + artistLineHeight + textGap * 2

    const expandedTopHeight = Math.max(
        collapsedHeight,
        outerPaddingY + metadataHeight + expandedTopBottomPadding
    )
    const expandedHeight =
        expandedTopHeight +
        progressMarginTop +
        progressBarHeight +
        progressGap +
        10 +
        progressBottomPadding

    const chromeWidth = outerPaddingX * 2 + albumSize + albumTextGap + innerPadding
    const idleTextWidth = 5 + 6 + measureTextWidth("Not Listening", 10, 400, 1.3) + innerPadding + 4
    const minIdleWidth = outerPaddingX + albumSize + albumTextGap + idleTextWidth + outerPaddingX
    const collapsedWidth = isPlaying ? collapsedPlayingWidth : Math.max(collapsedIdleWidth, minIdleWidth)
    const minimumExpandedWidth = collapsedPlayingWidth + Math.max(48, albumSize * 2)
    const measuredContentWidth = Math.max(
        168,
        measureTextWidth("Now Playing", 9, 600, 1.4) + 18,
        measureTextWidth(data?.song, 13, 600),
        measureTextWidth(data?.artist, 11, 500)
    )
    const expandedWidth = isPlaying
        ? Math.max(
              collapsedPlayingWidth,
              Math.min(
                  maxExpandedWidth,
                  Math.max(minimumExpandedWidth, chromeWidth + measuredContentWidth)
              )
          )
        : collapsedIdleWidth

    const shellExpanded =
        hoverPhase === "expanding" || hoverPhase === "expanded"
    const shellCollapsing = hoverPhase === "collapsing"
    const shellElevated = hoverPhase !== "collapsed"
    const ambientAccentStrong = withAlpha(accentResolved, 0.12)
    const ambientAccentSoft = withAlpha(accentResolved, 0.05)
    const ambientAccentFaint = withAlpha(accentResolved, 0.018)
    const trackBackground = withAlpha(mutedColor, 0.42)
    const progressFillGlow = withAlpha(accentResolved, 0.1)

    const resolvedShadowBlur = typeof shadowBlur === "number" ? shadowBlur : 20

    const activeShadowColor = themeMode === "dark" ? shadowColorDark : shadowColorLight
    const sp = parseShadowRGBA(activeShadowColor)
    const outerRing = themeMode === "light"
        ? "0 0 0 1px rgba(0,0,0,0.07), "
        : "0 0 0 0.5px rgba(255,255,255,0.07), "
    const shadowResting = sp
        ? `${outerRing}0 8px ${resolvedShadowBlur}px rgba(${sp.r},${sp.g},${sp.b},${sp.a})`
        : `${outerRing}0 8px ${resolvedShadowBlur}px ${activeShadowColor || "rgba(0,0,0,0.24)"}`
    const shadowElevated = sp
        ? `${outerRing}0 8px ${resolvedShadowBlur}px rgba(${sp.r},${sp.g},${sp.b},${Math.min(1, sp.a * 1.5)})`
        : `${outerRing}0 8px ${resolvedShadowBlur}px ${activeShadowColor || "rgba(0,0,0,0.36)"}`

    const resolvedNotListeningColor = notListeningColor || mutedColor
    const resolvedAlbumPlaceholderColor = albumPlaceholderColor || mutedColor
    const resolvedExpandedTextColor = expandedTextColor || mutedColor

    const topPaddingTop = shellExpanded ? outerPaddingY : innerPadding
    const topPaddingBottom = shellExpanded ? expandedTopBottomPadding : innerPadding
    const rightPanelHeight = shellExpanded
        ? expandedTopHeight - topPaddingTop - topPaddingBottom
        : waveRowHeight

    const shellTransition = shellCollapsing
        ? [
              `width ${shellCollapseDuration}s ${easing} ${shellCollapseDelay}s`,
              `height ${shellCollapseDuration}s ${easing} ${shellCollapseDelay}s`,
              `border-radius ${shellCollapseDuration}s ${easing} ${shellCollapseDelay}s`,
              `box-shadow ${shellCollapseDuration}s ease ${shellCollapseDelay}s`,
          ].join(", ")
        : [
              `width ${shellExpandDuration}s ${easing}`,
              `height ${shellExpandDuration}s ${easing}`,
              `border-radius ${shellExpandDuration}s ${easing}`,
              `box-shadow ${shellExpandDuration}s ease`,
          ].join(", ")

    const topStripTransition = shellCollapsing
        ? [
              `height ${shellCollapseDuration}s ${easing} ${shellCollapseDelay}s`,
              `padding ${shellCollapseDuration}s ${easing} ${shellCollapseDelay}s`,
          ].join(", ")
        : [
              `height ${shellExpandDuration}s ${easing}`,
              `padding ${shellExpandDuration}s ${easing}`,
          ].join(", ")

    const rightPanelTransition = shellCollapsing
        ? `height ${shellCollapseDuration}s ${easing} ${shellCollapseDelay}s`
        : `height ${shellExpandDuration}s ${easing}`

    const waveTransition = shellCollapsing
        ? [
              `transform ${waveMorphDuration}s ${easing} ${waveReturnDelay}s`,
              `opacity ${waveFadeDuration}s ease ${waveReturnDelay}s`,
          ].join(", ")
        : [
              `transform ${waveMorphDuration}s ${easing}`,
              `opacity ${waveFadeDuration}s ease 0.04s`,
          ].join(", ")

    const detailsTransition = shellCollapsing
        ? [
              `opacity 0.18s ease`,
              `transform 0.22s ${easing}`,
              `filter 0.22s ease`,
          ].join(", ")
        : [
              `opacity ${detailsFadeDuration}s ease ${detailsEnterDelay}s`,
              `transform ${detailsFadeDuration}s ${easing} ${detailsEnterDelay}s`,
              `filter ${detailsFadeDuration}s ease ${detailsEnterDelay}s`,
          ].join(", ")

    const progressTransition = shellCollapsing
        ? [
              `max-height 0.28s ${easing}`,
              `margin-top 0.28s ${easing}`,
              `padding-bottom 0.28s ${easing}`,
              `opacity 0.18s ease`,
              `transform 0.22s ${easing}`,
          ].join(", ")
        : [
              `max-height ${shellExpandDuration}s ${easing} ${progressEnterDelay}s`,
              `margin-top ${shellExpandDuration}s ${easing} ${progressEnterDelay}s`,
              `padding-bottom ${shellExpandDuration}s ${easing} ${progressEnterDelay}s`,
              `opacity ${progressFadeDuration}s ease ${progressEnterDelay}s`,
              `transform ${progressFadeDuration}s ${easing} ${progressEnterDelay}s`,
          ].join(", ")

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

        const edgeZone = Math.round(barCount * 0.18)
        const activityMask = new Float32Array(barCount)
        for (let i = 0; i < barCount; i++) {
            let m
            if (i < edgeZone) m = i / edgeZone
            else if (i > barCount - 1 - edgeZone)
                m = (barCount - 1 - i) / edgeZone
            else m = 1
            m = Math.max(0, Math.min(1, m))
            activityMask[i] = m * m * (3 - 2 * m)
        }

        const barEnergy = new Float32Array(barCount)
        const currentHeights = new Float32Array(barCount)
        const uniformMinH = waveRowHeight * 0.08
        const maxH = waveRowHeight * 1.0
        for (let i = 0; i < barCount; i++) currentHeights[i] = uniformMinH

        const heightDecayPerFrame = 0.88
        const energyDecayPerFrame = 0.9
        const beatsPerSecond = effectiveBpm / 60
        const triggersPerBeat = 3.5
        const burstMin = 2
        const burstMax = 3

        const centerIdx = (barCount - 1) / 2
        const spawnEvent = (kick) => {
            const roll = Math.random()
            let peakCenter
            let sigma
            let amplitude

            if (roll < 0.35) {
                peakCenter =
                    centerIdx + (Math.random() - 0.5) * barCount * 0.25
                sigma = barCount * 0.05 + Math.random() * barCount * 0.04
                amplitude = (0.7 + Math.random() * 0.3) * (1 + kick * 0.4)
            } else if (roll < 0.75) {
                peakCenter =
                    centerIdx + (Math.random() - 0.5) * barCount * 0.55
                sigma = barCount * 0.035 + Math.random() * barCount * 0.025
                amplitude = 0.4 + Math.random() * 0.35
            } else {
                peakCenter =
                    edgeZone + Math.random() * (barCount - edgeZone * 2)
                sigma = barCount * 0.02 + Math.random() * barCount * 0.02
                amplitude = 0.3 + Math.random() * 0.3
            }

            const twoSigmaSq = 2 * sigma * sigma
            const radius = Math.ceil(sigma * 3)
            const start = Math.max(0, Math.floor(peakCenter - radius))
            const end = Math.min(barCount - 1, Math.ceil(peakCenter + radius))

            for (let i = start; i <= end; i++) {
                const d = i - peakCenter
                const falloff =
                    Math.exp(-(d * d) / twoSigmaSq) *
                    activityMask[i] *
                    envelopeAt(i)
                const contrib = amplitude * falloff
                if (contrib > barEnergy[i]) barEnergy[i] = contrib
            }
        }

        const startTime = performance.now()
        let lastFrameTime = startTime
        let nextSpawnAt = 0

        const frame = () => {
            const now = performance.now()
            const t = (now - startTime) / 1000
            const dt = Math.min(50, now - lastFrameTime) / (1000 / 60)
            lastFrameTime = now

            const beatPhase = (t * beatsPerSecond) % 1
            const kick =
                beatPhase < 0.1
                    ? beatPhase / 0.1
                    : Math.exp(-(beatPhase - 0.1) * 4)

            if (t >= nextSpawnAt) {
                const burstCount =
                    burstMin +
                    Math.floor(Math.random() * (burstMax - burstMin + 1))
                for (let k = 0; k < burstCount; k++) spawnEvent(kick)
                const interval = 1 / (beatsPerSecond * triggersPerBeat)
                nextSpawnAt = t + interval * (0.6 + Math.random() * 0.8)
            }

            const decayK = Math.pow(heightDecayPerFrame, dt)
            const energyK = Math.pow(energyDecayPerFrame, dt)

            for (let i = 0; i < barCount; i++) {
                const el = barRefs.current[i]
                if (!el) continue

                const sway =
                    Math.sin(
                        t * temporalFreq * Math.PI * 2 +
                            i * spatialFreq * Math.PI * 2
                    ) *
                    0.015 *
                    swingAmount
                const target =
                    uniformMinH +
                    (maxH - uniformMinH) *
                        Math.min(1, Math.max(0, barEnergy[i] + sway))

                if (target >= currentHeights[i]) {
                    currentHeights[i] = target
                } else {
                    currentHeights[i] =
                        uniformMinH + (currentHeights[i] - uniformMinH) * decayK
                    if (currentHeights[i] < uniformMinH) {
                        currentHeights[i] = uniformMinH
                    }
                }

                barEnergy[i] *= energyK
                el.style.height = `${currentHeights[i]}px`
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
        effectiveBpm,
        envelopeSigma,
        spatialFreq,
        swingAmount,
        temporalFreq,
    ])

    return (
        <div
            onClick={() => { if (isCoarsePointer() && shellElevated) collapseHoverCard() }}
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                position: "relative",
            }}
        >
            <style>{`
                @keyframes spotifyAmbientDriftPrimary {
                    0% {
                        transform: translate3d(-9%, -6%, 0) scale(1.02);
                    }
                    33% {
                        transform: translate3d(7%, 10%, 0) scale(1.07);
                    }
                    66% {
                        transform: translate3d(12%, -8%, 0) scale(1.03);
                    }
                    100% {
                        transform: translate3d(-9%, -6%, 0) scale(1.02);
                    }
                }

                @keyframes spotifyAmbientDriftSecondary {
                    0% {
                        transform: translate3d(10%, 8%, 0) scale(0.96);
                    }
                    50% {
                        transform: translate3d(-8%, -10%, 0) scale(1.04);
                    }
                    100% {
                        transform: translate3d(10%, 8%, 0) scale(0.96);
                    }
                }

                @keyframes spotifyGlassBreathe {
                    0%,
                    100% {
                        opacity: 0.38;
                    }
                    50% {
                        opacity: 0.5;
                    }
                }
            `}</style>
            <div
                onMouseEnter={() => { if (!isCoarsePointer()) expandHoverCard() }}
                onMouseLeave={() => { if (!isCoarsePointer()) collapseHoverCard() }}
                onClick={handlePillClick}
                style={{
                    width: shellExpanded ? expandedWidth : collapsedWidth,
                    height: shellExpanded ? expandedHeight : collapsedHeight,
                    background: backgroundColor,
                    backdropFilter: "blur(4px) saturate(80%)",
                    WebkitBackdropFilter: "blur(4px) saturate(80%)",
                    borderRadius: shellExpanded
                        ? Math.max(22, collapsedHeight * 0.42)
                        : collapsedHeight / 2,
                    position: "relative",
                    overflow: "hidden",
                    transition: shellTransition,
                    fontFamily: FONT_FAMILY,
                    boxShadow: shellExpanded ? shadowElevated : shadowResting,
                    display: "flex",
                    flexDirection: "column",
                    color: textColor,
                    willChange: "width, height, border-radius",
                    cursor: isPlaying ? "pointer" : "default",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                    }}
                >
                    <div
                        style={{
                            position: "absolute",
                            inset: "-28%",
                            borderRadius: "50%",
                            background: `radial-gradient(circle, ${ambientAccentStrong} 0%, ${ambientAccentSoft} 26%, ${ambientAccentFaint} 48%, rgba(255,255,255,0) 72%)`,
                            filter: "blur(16px)",
                            opacity: shellElevated ? 0.62 : 0.48,
                            animation:
                                "spotifyAmbientDriftPrimary 18s ease-in-out infinite",
                        }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            inset: "-34%",
                            borderRadius: "50%",
                            background: `radial-gradient(circle, ${ambientAccentSoft} 0%, ${ambientAccentFaint} 34%, rgba(255,255,255,0) 70%)`,
                            filter: "blur(22px)",
                            opacity: shellElevated ? 0.28 : 0.2,
                            animation:
                                "spotifyAmbientDriftSecondary 24s ease-in-out infinite",
                        }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            background: themeMode === "light"
                                ? "linear-gradient(180deg, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.01) 22%, rgba(0,0,0,0) 48%, rgba(0,0,0,0) 100%)"
                                : "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.025) 22%, rgba(255,255,255,0.01) 48%, rgba(255,255,255,0) 100%)",
                            animation:
                                "spotifyGlassBreathe 9s ease-in-out infinite",
                            opacity: 0.52,
                        }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: "inherit",
                            boxShadow: themeMode === "light"
                                ? "inset 0 1px 0 rgba(0,0,0,0.07), inset 0 2px 6px rgba(0,0,0,0.04)"
                                : "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 2px 8px rgba(0,0,0,0.18)",
                        }}
                    />
                </div>
                <div
                    style={{
                        position: "relative",
                        zIndex: 1,
                        height: shellExpanded ? expandedTopHeight : collapsedHeight,
                        padding: `${topPaddingTop}px ${outerPaddingX}px ${topPaddingBottom}px ${outerPaddingX}px`,
                        boxSizing: "border-box",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: albumTextGap,
                        flexShrink: 0,
                        transition: topStripTransition,
                    }}
                >
                    <div
                        style={{
                            width: albumSize,
                            height: albumSize,
                            flexShrink: 0,
                            borderRadius: albumBorderRadius,
                            background: resolvedAlbumPlaceholderColor,
                            backgroundImage:
                                isPlaying && data?.album_art_url
                                    ? `url(${data.album_art_url})`
                                    : "none",
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            position: "relative",
                            boxShadow: shellElevated
                                ? themeMode === "light"
                                    ? "0 10px 22px rgba(0,0,0,0.28)"
                                    : "0 10px 22px rgba(0,0,0,0.18)"
                                : "none",
                            transition: "box-shadow 0.3s ease",
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

                    {isPlaying ? (
                        <div
                            style={{
                                position: "relative",
                                flex: 1,
                                minWidth: 0,
                                height: rightPanelHeight,
                                transition: rightPanelTransition,
                            }}
                        >
                            <div
                                style={{
                                    position: "absolute",
                                    top: "50%",
                                    left: 0,
                                    right: innerPadding,
                                    height: waveRowHeight,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: barGap,
                                    opacity: shellExpanded ? 0 : 1,
                                    transformOrigin: "center center",
                                    transform: shellExpanded
                                        ? "translateY(-50%) scaleY(0.12)"
                                        : "translateY(-50%) scaleY(1)",
                                    transition: waveTransition,
                                    pointerEvents: shellExpanded ? "none" : "auto",
                                    filter: shellExpanded ? "blur(1px)" : "blur(0px)",
                                }}
                            >
                                {Array.from({ length: barCount }).map((_, i) => (
                                    <div
                                        key={i}
                                        ref={(el) => (barRefs.current[i] = el)}
                                        style={{
                                            flex: 1,
                                            height: `${waveRowHeight * 0.3}px`,
                                            background: accent,
                                            borderRadius: 999,
                                            transition: "background 0.4s ease",
                                        }}
                                    />
                                ))}
                            </div>

                            <div
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "flex-start",
                                    gap: textGap,
                                    minWidth: 0,
                                    paddingRight: innerPadding,
                                    opacity: shellExpanded ? 1 : 0,
                                    transform: shellExpanded
                                        ? "translateY(0)"
                                        : "translateY(8px)",
                                    filter: shellExpanded
                                        ? "blur(0px)"
                                        : "blur(6px)",
                                    transition: detailsTransition,
                                    pointerEvents: shellExpanded ? "auto" : "none",
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 9,
                                        lineHeight: `${labelLineHeight}px`,
                                        fontWeight: 600,
                                        textTransform: "uppercase",
                                        letterSpacing: 1.4,
                                        color: resolvedExpandedTextColor,
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
                                            background: accent,
                                            boxShadow: `0 0 8px ${accent}`,
                                            flexShrink: 0,
                                        }}
                                    />
                                    Now Playing
                                </div>

                                <div
                                    style={{
                                        fontSize: 13,
                                        lineHeight: `${titleLineHeight}px`,
                                        fontWeight: 600,
                                        color: textColor,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {data.song}
                                </div>

                                <div
                                    style={{
                                        fontSize: 11,
                                        lineHeight: `${artistLineHeight}px`,
                                        color: resolvedExpandedTextColor,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
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
                                color: resolvedNotListeningColor,
                                height: albumSize,
                                paddingRight: innerPadding,
                                minWidth: 0,
                                whiteSpace: "nowrap",
                            }}
                        >
                            <span
                                style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: "50%",
                                    background: resolvedNotListeningColor,
                                    flexShrink: 0,
                                }}
                            />
                            Not Listening
                        </div>
                    )}
                </div>

                {isPlaying && (
                    <div
                        style={{
                            position: "relative",
                            zIndex: 1,
                            padding: `0 ${outerPaddingX}px ${shellExpanded ? progressBottomPadding : 0}px ${outerPaddingX}px`,
                            boxSizing: "border-box",
                            display: "flex",
                            flexDirection: "column",
                            gap: progressGap,
                            marginTop: shellExpanded ? progressMarginTop : 0,
                            maxHeight: shellExpanded
                                ? expandedHeight - expandedTopHeight
                                : 0,
                            opacity: shellExpanded ? 1 : 0,
                            transform: shellExpanded
                                ? "translateY(0)"
                                : "translateY(-6px)",
                            overflow: "hidden",
                            transition: progressTransition,
                        }}
                    >
                        <div
                            style={{
                                position: "relative",
                                height: 12,
                                display: "flex",
                                alignItems: "center",
                                overflow: "visible",
                            }}
                        >
                            <div
                                style={{
                                    width: "100%",
                                    height: progressBarHeight,
                                    background: trackBackground,
                                    borderRadius: 999,
                                    position: "relative",
                                    overflow: "visible",
                                    zIndex: 1,
                                }}
                            >
                                <div
                                    style={{
                                        position: "relative",
                                        height: "100%",
                                        width: `${progress}%`,
                                        minWidth:
                                            progress > 0
                                                ? progressBarHeight
                                                : 0,
                                        background: accent,
                                        borderRadius: 999,
                                        boxShadow: `0 0 10px ${progressFillGlow}`,
                                        transition: "width 0.5s linear",
                                        overflow: "visible",
                                    }}
                                />
                            </div>
                        </div>

                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: 10,
                                color: resolvedExpandedTextColor,
                                fontVariantNumeric: "tabular-nums",
                                lineHeight: "10px",
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
    notListeningColor: {
        type: ControlType.Color,
        title: "Not Listening",
        defaultValue: "#52525B",
    },
    albumPlaceholderColor: {
        type: ControlType.Color,
        title: "Album Placeholder",
        defaultValue: "#52525B",
    },
    expandedTextColor: {
        type: ControlType.Color,
        title: "Expanded Text",
        defaultValue: "#52525B",
    },
    shadowColorLight: {
        type: ControlType.Color,
        title: "Shadow (Light)",
        defaultValue: "#00000040",
    },
    shadowColorDark: {
        type: ControlType.Color,
        title: "Shadow (Dark)",
        defaultValue: "#00000070",
    },
    shadowBlur: {
        type: ControlType.Number,
        title: "Shadow Blur",
        defaultValue: 20,
        min: 0,
        max: 80,
        step: 1,
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
