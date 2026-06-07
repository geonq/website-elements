// @ts-nocheck
// backnforth.tsx — Framer CODE OVERRIDES for macOS-Finder-style back/forward navigation.
//
// ─── WIRING ───────────────────────────────────────────────────────────────────
//   INSIDE the Smart Component source (right-click → Edit Code in Framer):
//   Add the SMART COMPONENT PATCH block below after your useVariantState line.
//
//   On the canvas (applied to elements INSIDE the Smart Component):
//     • Each sidebar item     → withGoTo<Name>   (removes On Tap → Change Variant)
//     • Left arrow  < button  → withBack
//     • Right arrow > button  → withForward
// ─────────────────────────────────────────────────────────────────────────────
//
// ─── SMART COMPONENT PATCH ───────────────────────────────────────────────────
//   Paste this inside your Smart Component, right after useVariantState:
//
//   useEffect(() => {
//       const handler = (e: any) => {
//           const s = e.detail
//           setVariant(s.entries[s.index] ?? "about me")
//       }
//       window.addEventListener("finder:nav", handler)
//       return () => window.removeEventListener("finder:nav", handler)
//   }, [])
//
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

function broadcastNav(state: HistoryState) {
    if (typeof window === "undefined") return
    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
    window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: state }))
}

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

// goTo — applied to sidebar items inside the Smart Component.
// Pushes to history (fires finder:nav → Smart Component patch calls setVariant).
// Also shows active state: opacity 1 when current page, 0.8 otherwise.
function goTo(target: string) {
    return (Component: any): ComponentType => {
        return (props: any) => {
            const [nav, update] = useNav()
            const isActive = (nav.entries[nav.index] ?? PRIMARY_VARIANT) === target
            const handleClick = (event: any) => {
                const next = pushVariant(nav, target)
                if (next !== nav) update(next)
                props.onClick?.(event)
            }
            return (
                <Component
                    {...props}
                    onClick={handleClick}
                    style={{
                        ...props.style,
                        cursor: "pointer",
                        opacity: isActive ? 1 : 0.8,
                        transition: "opacity 0.15s ease",
                    }}
                />
            )
        }
    }
}

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

// withBack — left arrow. Fades to 0.5 and disables clicks when at the floor.
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

// withForward — right arrow. Fades to 0.5 and disables clicks when no forward history.
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
