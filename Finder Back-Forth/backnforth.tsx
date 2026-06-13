// @ts-nocheck
// backnforth.tsx — Framer CODE OVERRIDES for macOS-Finder-style back/forward navigation.
//
// SETUP
//   • withContent — apply to the CONTENT COMPONENT INSTANCE (the layer whose
//     properties panel shows the "Variant" dropdown), in the NORMAL editor.
//     Do NOT apply it inside the component's edit-variants view — that attaches
//     to a variant's contents instead of the instance, and nothing will switch.
//     This override drives the instance's `variant` prop from the history store.
//   • withBack / withForward — the navigation arrows.
//   • withRed / withYellow / withGreen — the traffic-light buttons.
//   • withGoTo* — the sidebar tabs; each pushes its variant onto the history.
//   • No Framer click interactions are needed — the code does all the switching.
//
// MOBILE
//   The shared history holds the LOGICAL page name (= your desktop variant name).
//   Mobile variants are those same names + " mobile". So mobile reuses ALL the
//   same overrides (tabs, back, forward, red, yellow, green) — the ONLY change is
//   the content instance: apply withContentMobile (instead of withContent) to the
//   Phone-breakpoint content instance. It appends " mobile", so the store value
//   "about me" renders the "about me mobile" variant. No mobile tab overrides
//   needed; just reuse withGoToAboutMe etc. on the mobile buttons too.
//
// The variant name strings below must match your Framer variant names EXACTLY
// (case + spaces).

import type { ComponentType } from "react"
import { forwardRef, useEffect } from "react"
import { createStore } from "https://framer.com/m/framer/store.js@^1.0.0"

// ── CONFIG ───────────────────────────────────────────────────────
const PRIMARY_VARIANT = "about me"
const MAX_HISTORY = 16
const STORAGE_KEY = "finder-nav-history"
const DISABLED_OPACITY = 0.5
const MOBILE_SUFFIX = " mobile" // mobile variants are the desktop names + this suffix

// ── TYPES ────────────────────────────────────────────────────────
type HistoryState = { entries: string[]; index: number; isMobile: boolean }
const FALLBACK: HistoryState = { entries: [PRIMARY_VARIANT], index: 0, isMobile: false }

// ── PERSISTENCE ──────────────────────────────────────────────────
function loadHistory(): HistoryState {
    if (typeof window === "undefined") return FALLBACK
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY)
        if (!raw) return FALLBACK
        const p = JSON.parse(raw)
        if (!p?.entries?.length || typeof p.index !== "number") return FALLBACK
        const entries = p.entries.filter((v: unknown) => typeof v === "string").slice(0, MAX_HISTORY)
        if (!entries.length) return FALLBACK
        return { entries, index: Math.min(Math.max(0, Math.floor(p.index)), entries.length - 1) }
    } catch { return FALLBACK }
}

function persist(state: HistoryState) {
    try { window?.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

// ── SHARED STORE (Framer createStore — reactive across all overrides) ─────────
const useNav = createStore<HistoryState>(loadHistory())

// Single mutation path: persist + push to the store.
function commit(setNav: (s: HistoryState) => void, next: HistoryState) {
    persist(next)
    setNav(next)
}

// ── HISTORY OPS ──────────────────────────────────────────────────
function pushVariant(state: HistoryState, target: string): HistoryState {
    if (!target || state.entries[state.index] === target) return state
    const truncated = state.entries.slice(0, state.index + 1)
    const next = [...truncated, target]
    // Always preserve entry[0] when capping
    const entries = next.length <= MAX_HISTORY
        ? next
        : [next[0], ...next.slice(next.length - MAX_HISTORY + 1)]
    return { entries, index: entries.length - 1 }
}

function currentVariant(state: HistoryState): string {
    return state.entries[state.index] ?? PRIMARY_VARIANT
}

// ── OVERRIDES ────────────────────────────────────────────────────

// Drives the visible variant. Apply to the DESKTOP content component INSTANCE.
export function withContent(Component: any): ComponentType {
    return forwardRef((props: any, ref) => {
        const [nav, setNav] = useNav()
        useEffect(() => { setNav(s => ({ ...s, isMobile: false })) }, [])
        return <Component ref={ref} {...props} variant={currentVariant(nav)} />
    })
}

// Same as withContent, but appends " mobile". Apply to the MOBILE content INSTANCE.
// Sets isMobile:true in the store so withYellow knows not to navigate to "extra".
export function withContentMobile(Component: any): ComponentType {
    return forwardRef((props: any, ref) => {
        const [nav, setNav] = useNav()
        useEffect(() => { setNav(s => ({ ...s, isMobile: true })) }, [])
        return <Component ref={ref} {...props} variant={currentVariant(nav) + MOBILE_SUFFIX} />
    })
}

function goTo(target: string) {
    return (Component: any): ComponentType =>
        forwardRef((props: any, ref) => {
            const [nav, setNav] = useNav()
            return (
                <Component
                    ref={ref}
                    {...props}
                    onClick={(e: any) => {
                        const next = pushVariant(nav, target)
                        if (next !== nav) commit(setNav, next)
                        props.onClick?.(e)
                    }}
                    style={{ ...props.style, cursor: "pointer" }}
                />
            )
        })
}

// "extra" is a planned variant — create it in Framer (and an "extra mobile"
// copy) when ready. Until then, navigating to it falls back to the default.
// Both overrides target it: withYellow is the traffic-light button; withExtra is
// a generic alias to drop on any element that should open the extra variant.
export function withExtra(C: any): ComponentType { return goTo("extra")(C) }
export function withYellow(C: any): ComponentType {
    return forwardRef((props: any, ref) => {
        const [nav, setNav] = useNav()
        return (
            <C
                ref={ref}
                {...props}
                onClick={(e: any) => {
                    if (nav.isMobile) return
                    const next = pushVariant(nav, "extra")
                    if (next !== nav) commit(setNav, next)
                    props.onClick?.(e)
                }}
                style={{ ...props.style, cursor: "pointer" }}
            />
        )
    })
}

export function withRed(Component: any): ComponentType {
    return forwardRef((props: any, ref) => {
        const [, setNav] = useNav()
        return (
            <Component
                ref={ref}
                {...props}
                onClick={(e: any) => {
                    commit(setNav, { entries: [PRIMARY_VARIANT], index: 0 })
                    props.onClick?.(e)
                }}
                style={{ ...props.style, cursor: "pointer" }}
            />
        )
    })
}

export function withGreen(Component: any): ComponentType {
    return forwardRef((props: any, ref) => (
        <Component
            ref={ref}
            {...props}
            onClick={(e: any) => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen?.()
                } else {
                    document.exitFullscreen?.()
                }
                props.onClick?.(e)
            }}
            style={{ ...props.style, cursor: "pointer" }}
        />
    ))
}

export function withGoToAboutMe(C: any): ComponentType { return goTo("about me")(C) }
export function withGoToWorkAndProjects(C: any): ComponentType { return goTo("work & projects")(C) }
export function withGoToOutOfOffice(C: any): ComponentType { return goTo("out of office")(C) }
export function withGoToAcademicRecord(C: any): ComponentType { return goTo("academic record")(C) }
export function withGoToSpotifyPlaylist(C: any): ComponentType { return goTo("spotify playlist")(C) }
export function withGoToCurrentInspo(C: any): ComponentType { return goTo("current inspo")(C) }
export function withGoToRecommendedWatch(C: any): ComponentType { return goTo("recommended watch")(C) }
export function withGoToAscii(C: any): ComponentType { return goTo("ascii")(C) }
export function withGoToGoodreads(C: any): ComponentType { return goTo("goodreads")(C) }

export function withBack(Component: any): ComponentType {
    return forwardRef((props: any, ref) => {
        const [nav, setNav] = useNav()
        const can = nav.index > 0
        return (
            <Component
                ref={ref}
                {...props}
                onClick={(e: any) => {
                    if (!can) return
                    commit(setNav, { entries: nav.entries, index: nav.index - 1 })
                    props.onClick?.(e)
                }}
                animate={{ opacity: can ? 1 : DISABLED_OPACITY }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{ ...props.style, pointerEvents: can ? "auto" : "none", cursor: can ? "pointer" : "default" }}
            />
        )
    })
}

export function withForward(Component: any): ComponentType {
    return forwardRef((props: any, ref) => {
        const [nav, setNav] = useNav()
        const can = nav.index < nav.entries.length - 1
        return (
            <Component
                ref={ref}
                {...props}
                onClick={(e: any) => {
                    if (!can) return
                    commit(setNav, { entries: nav.entries, index: nav.index + 1 })
                    props.onClick?.(e)
                }}
                animate={{ opacity: can ? 1 : DISABLED_OPACITY }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{ ...props.style, pointerEvents: can ? "auto" : "none", cursor: can ? "pointer" : "default" }}
            />
        )
    })
}
