// @ts-nocheck
import { forwardRef, type ComponentType, useSyncExternalStore } from "react"

const WORKER_URL = "https://goodreads.domkegeorg2017.workers.dev/goodreads" // CHANGE ME
const POLL_INTERVAL_MS = 30 * 60 * 1_000 // 30 minutes
const FALLBACK_TEXT = "—"

type BookInfo = {
    title: string | null
    author: string | null
    coverUrl: string | null
}

type GoodreadsData = {
    currentlyReading: BookInfo | null
    lastFinished: (BookInfo & { rating: number | null }) | null
    totalRead: number | null
    lastUpdated: string
}

type StoreState = {
    data: GoodreadsData | null
    loading: boolean
    error: string | null
}

const listeners = new Set<() => void>()

let state: StoreState = {
    data: null,
    loading: false,
    error: null,
}

let inFlightRequest: Promise<void> | null = null
let pollTimer: ReturnType<typeof globalThis.setInterval> | null = null

function publish(nextState: StoreState) {
    state = nextState
    listeners.forEach((listener) => listener())
}

function updateState(patch: Partial<StoreState>) {
    publish({ ...state, ...patch })
}

function getSnapshot() {
    return state
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
}

function getStyle(style: unknown): Record<string, unknown> {
    return isRecord(style) ? style : {}
}

function formatText(value: string | null | undefined): string {
    if (value === null || value === undefined || value === "") return FALLBACK_TEXT
    return value
}

function parseBookInfo(raw: unknown): BookInfo | null {
    if (!isRecord(raw)) return null
    return {
        title: typeof raw.title === "string" ? raw.title : null,
        author: typeof raw.author === "string" ? raw.author : null,
        coverUrl: typeof raw.coverUrl === "string" ? raw.coverUrl : null,
    }
}

async function fetchGoodreadsData(): Promise<void> {
    if (inFlightRequest) return inFlightRequest

    inFlightRequest = (async () => {
        updateState({ loading: state.data === null, error: null })

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

            const currentlyReading = parseBookInfo(payload.currentlyReading)

            const lastFinishedRaw = isRecord(payload.lastFinished) ? payload.lastFinished : null
            const lastFinished = lastFinishedRaw
                ? {
                      ...parseBookInfo(lastFinishedRaw)!,
                      rating:
                          typeof lastFinishedRaw.rating === "number"
                              ? lastFinishedRaw.rating
                              : null,
                  }
                : null

            publish({
                data: {
                    currentlyReading,
                    lastFinished,
                    totalRead:
                        typeof payload.totalRead === "number" ? payload.totalRead : null,
                    lastUpdated:
                        typeof payload.lastUpdated === "string"
                            ? payload.lastUpdated
                            : new Date().toISOString(),
                },
                loading: false,
                error: null,
            })
        } catch (error) {
            updateState({
                loading: false,
                error: error instanceof Error ? error.message : "Unknown Goodreads fetch error.",
            })
        } finally {
            inFlightRequest = null
        }
    })()

    return inFlightRequest
}

function stopPolling() {
    if (pollTimer !== null) {
        globalThis.clearInterval(pollTimer)
        pollTimer = null
    }
}

function startPolling() {
    if (pollTimer !== null) return
    void fetchGoodreadsData()
    pollTimer = globalThis.setInterval(() => {
        void fetchGoodreadsData()
    }, POLL_INTERVAL_MS)
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    if (listeners.size === 1) startPolling()
    return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stopPolling()
    }
}

function useGoodreadsStore() {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useGoodreadsData() {
    return useGoodreadsStore()
}

// ── Currently reading ─────────────────────────────────────────────────────────

export const withCurrentTitle = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useGoodreadsStore()
        const text = formatText(data?.currentlyReading?.title ?? null)
        return <Component ref={ref} {...props} text={text} />
    })
}

export const withCurrentAuthor = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useGoodreadsStore()
        const text = formatText(data?.currentlyReading?.author ?? null)
        return <Component ref={ref} {...props} text={text} />
    })
}

export const withCurrentCover = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useGoodreadsStore()
        const coverUrl = data?.currentlyReading?.coverUrl ?? null
        if (!coverUrl) return <Component ref={ref} {...props} />
        return (
            <Component
                ref={ref}
                {...props}
                image={coverUrl}
                src={coverUrl}
                style={{
                    ...getStyle(props?.style),
                    backgroundImage: `url("${coverUrl}")`,
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "cover",
                }}
            />
        )
    })
}

// ── Last finished ─────────────────────────────────────────────────────────────

export const withLastTitle = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useGoodreadsStore()
        const text = formatText(data?.lastFinished?.title ?? null)
        return <Component ref={ref} {...props} text={text} />
    })
}

export const withLastAuthor = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useGoodreadsStore()
        const text = formatText(data?.lastFinished?.author ?? null)
        return <Component ref={ref} {...props} text={text} />
    })
}

export const withLastCover = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useGoodreadsStore()
        const coverUrl = data?.lastFinished?.coverUrl ?? null
        if (!coverUrl) return <Component ref={ref} {...props} />
        return (
            <Component
                ref={ref}
                {...props}
                image={coverUrl}
                src={coverUrl}
                style={{
                    ...getStyle(props?.style),
                    backgroundImage: `url("${coverUrl}")`,
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "cover",
                }}
            />
        )
    })
}

export const withLastRating = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useGoodreadsStore()
        const rating = data?.lastFinished?.rating ?? null
        const text = rating !== null ? String(rating) : FALLBACK_TEXT
        return <Component ref={ref} {...props} text={text} />
    })
}

// ── Totals ────────────────────────────────────────────────────────────────────

export const withTotalRead = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useGoodreadsStore()
        const total = data?.totalRead ?? null
        const text = total !== null ? new Intl.NumberFormat("en-US").format(total) : FALLBACK_TEXT
        return <Component ref={ref} {...props} text={text} />
    })
}
