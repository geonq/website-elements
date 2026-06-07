// @ts-nocheck
// backnforth.tsx — Framer CODE OVERRIDES for macOS-Finder-style back/forward
// navigation across a variant-based component.
//
// ─── WIRING ───────────────────────────────────────────────────────────────────
//   1. Select the component that has variants → Code Overrides → withFinder
//   2. Left arrow wrapper div → withBack
//   3. Right arrow wrapper div → withForward
//   4. Each clickable folder/link element → withGoTo<VariantName>
//      Remove any native "On Tap → Change to Variant" on those elements.
//
// ─── VARIANT NAMES ────────────────────────────────────────────────────────────
//   Strings must match Framer variant display names exactly (case-sensitive).
//   PRIMARY_VARIANT is the floor — you can never go Back past it.
// ─────────────────────────────────────────────────────────────────────────────

import type { ComponentType } from "react"
import { useState, useEffect } from "react"

// ──────────────────────────── CONFIG ────────────────────────────

const PRIMARY_VARIANT = "about me"
const MAX_HISTORY = 16
const STORAGE_KEY = "finder-nav-history"
const NAV_EVENT = "finder:nav"
const DISABLED_OPACITY = 0.5

// ──────────────────────────── TYPES ────────────────────────────

type HistoryState = {
    entries: string[]
    index: number
}

// ──────────────────────────── STATE ────────────────────────────

const FALLBACK: HistoryState = { entries: [PRIMARY_VARIANT], index: 0 }

function loadHistory(): HistoryState {
    if (typeof window === "undefined") return FALLBACK
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY)
        if (!raw) return FALLBACK
        const p = JSON.parse(raw)
        if (!p || !Array.isArray(p.entries) || !p.entries.length || typeof p.index !== "number") return FALLBACK
        const entries = p.entries.filter((v: unknown) => typeof v === "string").slice(0, MAX_HISTORY)
        if (!entries.length) return FALLBACK
        return { entries, index: Math.min(Math.max(0, Math.floor(p.index)), entries.length - 1) }
    } catch { return FALLBACK }
}

// Saves to sessionStorage and broadcasts to all useNav() consumers via CustomEvent.
function broadcastNav(state: HistoryState) {
    if (typeof window === "undefined") return
    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
    window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: state }))
}

// Each override instance gets its own local state, kept in sync via window events.
// This avoids any createStore reactivity quirks with Framer's component system.
function useNav(): [HistoryState, (s: HistoryState) => void] {
    const [state, setState] = useState<HistoryState>(loadHistory)

    useEffect(() => {
        const handler = (e: any) => setState(e.detail)
        window.addEventListener(NAV_EVENT, handler)
        return () => window.removeEventListener(NAV_EVENT, handler)
    }, [])

    const update = (next: HistoryState) => {
        setState(next)
        broadcastNav(next)
    }

    return [state, update]
}

// ──────────────────────────── HISTORY OPS ────────────────────────────

function capHistory(entries: string[]): string[] {
    if (entries.length <= MAX_HISTORY) return entries
    const overflow = entries.length - MAX_HISTORY
    return [entries[0], ...entries.slice(1 + overflow)]
}

function pushVariant(state: HistoryState, target: string): HistoryState {
    if (!target) return state
    if (state.entries[state.index] === target) return state
    const truncated = state.entries.slice(0, state.index + 1)
    const capped = capHistory([...truncated, target])
    return { entries: capped, index: capped.length - 1 }
}

// ──────────────────────────── OVERRIDES ────────────────────────────

// ─── APPROACH A: Smart Component variant prop (may not work — see note) ───────
// withFinder — apply to the Smart Component that has variants.
// NOTE: Framer Smart Components treat `variant` as internal state, not a
// controlled React prop. This HOC correctly passes the right variant but
// Framer's own state machine may ignore it. If the component doesn't visually
// switch, use APPROACH B below instead.
export function withFinder(Component: any): ComponentType {
    return ({ variant: _ignored, ...rest }: any) => {
        const [nav] = useNav()
        const current = nav.entries[nav.index] ?? PRIMARY_VARIANT
        console.log("[withFinder] variant →", current, nav)
        return <Component key={current} {...rest} variant={current} />
    }
}

// ─── APPROACH B: Visibility-based page switching (guaranteed to work) ─────────
// Instead of one Smart Component with variants, have 10 separate frames stacked
// at the same position in Framer. Apply the matching showPage* override to each
// frame. The active frame is fully visible; all others are opacity:0 + no clicks.
//
// Canvas setup:
//   1. Create one Frame per page, all at the same position/size (use Stack or
//      absolute position). Put the correct page content in each Frame.
//   2. Remove withFinder. Apply showPageAboutMe to the "about me" Frame,
//      showPageCurrentlyWorking to the "currently working" Frame, etc.
//   3. Keep withBack, withForward, and all withGoTo* exactly as before.
function showWhen(pageName: string) {
    return (Component: any): ComponentType => {
        return (props: any) => {
            const [nav] = useNav()
            const isActive = (nav.entries[nav.index] ?? PRIMARY_VARIANT) === pageName
            return (
                <Component
                    {...props}
                    style={{
                        ...props.style,
                        opacity: isActive ? 1 : 0,
                        pointerEvents: isActive ? "auto" : "none",
                        transition: "opacity 0.2s ease",
                    }}
                />
            )
        }
    }
}

export function showPageAboutMe(C: any): ComponentType { return showWhen("about me")(C) }
export function showPageCurrentlyWorking(C: any): ComponentType { return showWhen("currently working")(C) }
export function showPageOutOfOffice(C: any): ComponentType { return showWhen("out of office")(C) }
export function showPageAcademicRecord(C: any): ComponentType { return showWhen("academic record")(C) }
export function showPageSpotifyPlaylist(C: any): ComponentType { return showWhen("spotify playlist")(C) }
export function showPageCurrentInspo(C: any): ComponentType { return showWhen("current inspo")(C) }
export function showPageRecommendedWatch(C: any): ComponentType { return showWhen("recommended watch")(C) }
export function showPageAscii(C: any): ComponentType { return showWhen("ascii")(C) }
export function showPageLetterboxd(C: any): ComponentType { return showWhen("letterboxd")(C) }
export function showPageGoodreads(C: any): ComponentType { return showWhen("goodreads")(C) }

// goTo factory — one override per destination. Applied to clickable folder elements.
function goTo(target: string) {
    return (Component: any): ComponentType => {
        return (props: any) => {
            const [nav, update] = useNav()
            const handleClick = (event: any) => {
                console.log("[goTo] click →", target, "from", nav.entries[nav.index])
                const next = pushVariant(nav, target)
                if (next !== nav) update(next)
                props.onClick?.(event)
            }
            return <Component {...props} onClick={handleClick} />
        }
    }
}

// ─── Destination overrides — one per variant ───
// export function required — export const from a factory is invisible to Framer's parser.
export function withGoToAboutMe(C: any): ComponentType { return goTo("about me")(C) }
export function withGoToCurrentlyWorking(C: any): ComponentType { return goTo("currently working")(C) }
export function withGoToOutOfOffice(C: any): ComponentType { return goTo("out of office")(C) }
export function withGoToAcademicRecord(C: any): ComponentType { return goTo("academic record")(C) }
export function withGoToSpotifyPlaylist(C: any): ComponentType { return goTo("spotify playlist")(C) }
export function withGoToCurrentInspo(C: any): ComponentType { return goTo("current inspo")(C) }
export function withGoToRecommendedWatch(C: any): ComponentType { return goTo("recommended watch")(C) }
export function withGoToAscii(C: any): ComponentType { return goTo("ascii")(C) }
export function withGoToLetterboxd(C: any): ComponentType { return goTo("letterboxd")(C) }
export function withGoToGoodreads(C: any): ComponentType { return goTo("goodreads")(C) }

// withBack — apply to the LEFT arrow wrapper. Fades to 0.5 when at the floor.
export function withBack(Component: any): ComponentType {
    return (props: any) => {
        const [nav, update] = useNav()
        const can = nav.index > 0
        return (
            <Component
                {...props}
                onClick={(event: any) => {
                    if (!can) return
                    update({ ...nav, index: nav.index - 1 })
                    props.onClick?.(event)
                }}
                style={{
                    ...props.style,
                    opacity: can ? 1 : DISABLED_OPACITY,
                    pointerEvents: can ? "auto" : "none",
                    cursor: can ? "pointer" : "default",
                    transition: "opacity 0.2s ease",
                }}
            />
        )
    }
}

// withForward — apply to the RIGHT arrow wrapper. Fades to 0.5 when no forward history.
export function withForward(Component: any): ComponentType {
    return (props: any) => {
        const [nav, update] = useNav()
        const can = nav.index < nav.entries.length - 1
        return (
            <Component
                {...props}
                onClick={(event: any) => {
                    if (!can) return
                    update({ ...nav, index: nav.index + 1 })
                    props.onClick?.(event)
                }}
                style={{
                    ...props.style,
                    opacity: can ? 1 : DISABLED_OPACITY,
                    pointerEvents: can ? "auto" : "none",
                    cursor: can ? "pointer" : "default",
                    transition: "opacity 0.2s ease",
                }}
            />
        )
    }
}
