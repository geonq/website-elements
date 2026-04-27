import type { ComponentType } from "react"
import {
    withAccuracyPercent as withAccuracyPercentBase,
    withFaceitElo as withFaceitEloBase,
    withOnlineStatusText as withOnlineStatusTextBase,
    withPremierRating as withPremierRatingBase,
    withPreaim as withPreaimBase,
    withProfileAvatar as withProfileAvatarBase,
    withProfileName as withProfileNameBase,
    withReactionTimeMs as withReactionTimeMsBase,
    withWingmanRating as withWingmanRatingBase,
} from "./CS2Store"

export const withPremierRating = (Component): ComponentType => {
    return withPremierRatingBase(Component)
}

export const withWingmanRating = (Component): ComponentType => {
    return withWingmanRatingBase(Component)
}

export const withFaceitElo = (Component): ComponentType => {
    return withFaceitEloBase(Component)
}

export const withPreaim = (Component): ComponentType => {
    return withPreaimBase(Component)
}

export const withProfileAvatar = (Component): ComponentType => {
    return withProfileAvatarBase(Component)
}

export const withPlayerName = (Component): ComponentType => {
    return withProfileNameBase(Component)
}

export const withSteamName = (Component): ComponentType => {
    return withProfileNameBase(Component)
}

export const withAimRating = (Component): ComponentType => {
    return withPreaimBase(Component)
}

export const withReactionTime = (Component): ComponentType => {
    return withReactionTimeMsBase(Component)
}

export const withAccuracy = (Component): ComponentType => {
    return withAccuracyPercentBase(Component)
}

export const withOnlineStatus = (Component): ComponentType => {
    return withOnlineStatusTextBase(Component)
}
