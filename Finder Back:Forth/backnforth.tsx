// backnforth.tsx — Framer CODE OVERRIDES for macOS-Finder-style back/forward
// navigation across a variant-based component.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS IS
// ─────────────────────────────────────────────────────────────────────────────
// These are overrides (not a code component). They make a normal Framer
// component-with-variants behave like a Finder window: the current variant is
// the "folder" you're looking at, and Back/Forward walk a cached history of the
// variants you've visited — exactly like the ⌫ / ⌦ chevrons in real Finder.
//
// Rules implemented (per spec):
//   • The PRIMARY variant is the start. You can never go Back past it.
//   • After going Back you can go Forward again, as many steps as you went Back.
//   • Navigating to a NEW variant truncates any forward history (browser model).
//   • History is capped at MAX_HISTORY (16) entries so the page can't be made to
//     hoard unbounded state. Primary is preserved as the permanent floor: when
//     the cap is hit, the oldest entry *after* Primary is dropped.
//   • The last-visited position is cached in sessionStorage, so a reload drops
//     you back where you were (cache clears when the tab closes).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE FOLDER LINKS NEED AN OVERRIDE TOO
// ─────────────────────────────────────────────────────────────────────────────
// A Framer override can *set* a component's variant (via the `variant` prop) but
// it cannot observe the component changing its own variant through Framer's
// built-in "On Tap → Change to Variant" interactions. For real history the store
// must be the single source of truth — so the clicks that navigate INTO a
// variant go through a goTo() override instead of Framer's native variant switch.
//
// ─────────────────────────────────────────────────────────────────────────────
// HOW TO WIRE IT UP IN FRAMER
// ─────────────────────────────────────────────────────────────────────────────
//   1. Name your variants in the component. Set PRIMARY_VARIANT below to the
//      exact name of your starting variant (e.g. "Primary", "Home", "Desktop").
//   2. Select the Finder component on the canvas → Code Overrides → withFinder.
//   3. The back/forward control is one div holding two SVG arrows. Select the
//      LEFT arrow SVG → withBack. Select the RIGHT arrow SVG → withForward.
//      Each fades to 0.5 opacity and stops receiving taps when there's nowhere
//      to go, then smoothly fades back to full once a step becomes available.
//   4. For every clickable folder/link, apply the matching destination override
//      (withGoToProjects, withGoToContact, …). These are defined near the bottom
//      of this file via goTo("variant name") — add one line per variant you want
//      to reach, then pick it from the Code Overrides dropdown. Do NOT also use a
//      native "Change to Variant" interaction on those — let the override own the
//      variant.
//
// Notes
//   • Variant names are matched by their display name, exactly as typed in
//     Framer (case-sensitive). A typo = a silent no-op.
//   • Swap sessionStorage → localStorage in `persist`/`loadInitial` if you want
//     the history to survive a tab close.

import type { ComponentType } from "react"
import { createStore } from "https://framer.com/m/framer/store.js"

// ──────────────────────────── CONFIG ────────────────────────────

// The starting variant — the floor of the history. Must match the variant name
// in your component exactly.
const PRIMARY_VARIANT = "about me"

// Hard cap on stored history depth. Anything past this drops the oldest entry
// (Primary excluded — see capHistory). 16 keeps memory bounded.
const MAX_HISTORY = 16

// sessionStorage key for the cached history. Cleared when the tab closes.
const STORAGE_KEY = "finder-nav-history"

// Opacity of a button that currently has nowhere to go (disabled state).
const DISABLED_OPACITY = 0.5

// ──────────────────────────── TYPES ────────────────────────────

type HistoryState = {
    entries: string[] // ordered list of visited variant names; entries[0] = floor
    index: number // which entry is currently shown
}

// ──────────────────────────── PERSISTENCE ────────────────────────────

// Read the cached history at module load. Runs on both server (window
// undefined → fallback) and client (restores the real cache during hydration).
function loadInitial(): HistoryState {
    const fallback: HistoryState = { entries: [PRIMARY_VARIANT], index: 0 }
    if (typeof window === "undefined") return fallback

    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY)
        if (!raw) return fallback

        const parsed = JSON.parse(raw)
        if (
            !parsed ||
            !Array.isArray(parsed.entries) ||
            parsed.entries.length === 0 ||
            typeof parsed.index !== "number"
        ) {
            return fallback
        }

        // Sanitise anything that wandered in from a stale/corrupt cache.
        const entries: string[] = parsed.entries
            .filter((v: unknown) => typeof v === "string")
            .slice(0, MAX_HISTORY)
        if (entries.length === 0) return fallback

        const index = Math.min(
            Math.max(0, Math.floor(parsed.index)),
            entries.length - 1
        )
        return { entries, index }
    } catch {
        return fallback
    }
}

function persist(state: HistoryState) {
    if (typeof window === "undefined") return
    try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
        // Private mode / quota / disabled storage — navigation still works in
        // memory, it just won't survive a reload.
    }
}

// ──────────────────────────── STORE ────────────────────────────
// A single shared store so every override (Finder, links, buttons) reads and
// writes the same history. `setHistory` shallow-merges; we always pass a full
// HistoryState so the merge is total.

const useHistory = createStore<HistoryState>(loadInitial())

// Enforce the cap while keeping the floor (entries[0]) permanent. If we're over
// the limit, drop the oldest entry *after* the floor.
function capHistory(entries: string[]): string[] {
    if (entries.length <= MAX_HISTORY) return entries
    const overflow = entries.length - MAX_HISTORY
    // Keep [0] (the floor), drop the next `overflow` entries, keep the rest.
    return [entries[0], ...entries.slice(1 + overflow)]
}

// Push a brand-new destination onto the history (the "navigate into a folder"
// action). Truncates forward history, appends, caps, and re-floors the index.
function pushVariant(state: HistoryState, target: string): HistoryState {
    if (!target) return state
    // Already here — clicking the current folder shouldn't add a duplicate.
    if (state.entries[state.index] === target) return state

    const truncated = state.entries.slice(0, state.index + 1) // drop forward history
    const capped = capHistory([...truncated, target])
    return { entries: capped, index: capped.length - 1 }
}

// ──────────────────────────── OVERRIDES ────────────────────────────

// withFinder — apply to the variant component itself. Forces its variant to
// whatever the history currently points at, making it a controlled "window".
export function withFinder(Component: any): ComponentType {
    return (props: any) => {
        const [history] = useHistory()
        const current = history.entries[history.index] ?? PRIMARY_VARIANT
        return <Component {...props} variant={current} />
    }
}

// ─── Folder navigation ───
// A code override can't take a typed argument from the canvas, so instead of one
// configurable override we expose one READY-MADE override per destination via
// the goTo() factory. Apply the matching override to each clickable folder/link;
// on click it pushes that variant onto the history (truncating forward history).
//
// To add a destination: copy a line in the EXPORTS block below and change BOTH
// the export name and the variant string. The variant string must match your
// component's variant name EXACTLY — case-sensitive, spaces included.
function goTo(target: string) {
    return (Component: any): ComponentType => {
        return (props: any) => {
            const [history, setHistory] = useHistory()

            const handleClick = (event: any) => {
                const next = pushVariant(history, target)
                if (next !== history) {
                    persist(next)
                    setHistory(next)
                }
                props.onClick?.(event)
            }

            return <Component {...props} onClick={handleClick} />
        }
    }
}

// ─── Destination overrides — one per variant ───
// Each shows up in the Code Overrides dropdown by its export name (the part
// after "withGoTo"). Apply the matching one to the folder/link that opens it.
export const withGoToAboutMe = goTo("about me") // Primary / home
export const withGoToCurrentlyWorking = goTo("currently working")
export const withGoToOutOfOffice = goTo("out of office")
export const withGoToAcademicRecord = goTo("academic record")
export const withGoToSpotifyPlaylist = goTo("spotify playlist")
export const withGoToCurrentInspo = goTo("current inspo")
export const withGoToRecommendedWatch = goTo("recommended watch")
export const withGoToAscii = goTo("ascii")
export const withGoToLetterboxd = goTo("letterboxd")
export const withGoToGoodreads = goTo("goodreads")

// withBack — apply to the LEFT arrow SVG. Steps the index one toward the floor.
// Fades to DISABLED_OPACITY and ignores clicks when already at the floor (Primary).
export function withBack(Component: any): ComponentType {
    return (props: any) => {
        const [history, setHistory] = useHistory()
        const canGoBack = history.index > 0

        const handleClick = (event: any) => {
            if (!canGoBack) return
            const next: HistoryState = { ...history, index: history.index - 1 }
            persist(next)
            setHistory(next)
            props.onClick?.(event)
        }

        return (
            <Component
                {...props}
                onClick={handleClick}
                style={{
                    ...props.style,
                    opacity: canGoBack ? 1 : DISABLED_OPACITY,
                    pointerEvents: canGoBack ? "auto" : "none",
                    cursor: canGoBack ? "pointer" : "default",
                    transition: "opacity 0.2s ease",
                }}
            />
        )
    }
}

// withForward — apply to the RIGHT arrow SVG. Steps the index toward the most
// recent entry. Sits at DISABLED_OPACITY (0.5) with no clicks when there's no
// forward history, then smoothly fades to full opacity the moment you can go
// forward again.
export function withForward(Component: any): ComponentType {
    return (props: any) => {
        const [history, setHistory] = useHistory()
        const canGoForward = history.index < history.entries.length - 1

        const handleClick = (event: any) => {
            if (!canGoForward) return
            const next: HistoryState = { ...history, index: history.index + 1 }
            persist(next)
            setHistory(next)
            props.onClick?.(event)
        }

        return (
            <Component
                {...props}
                onClick={handleClick}
                style={{
                    ...props.style,
                    opacity: canGoForward ? 1 : DISABLED_OPACITY,
                    pointerEvents: canGoForward ? "auto" : "none",
                    cursor: canGoForward ? "pointer" : "default",
                    transition: "opacity 0.2s ease",
                }}
            />
        )
    }
}
