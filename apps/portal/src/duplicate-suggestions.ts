import type { PublicFeedbackItem } from '@feedbax/core'

export const normalizeSuggestionTitle = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

function editSimilarity(left: string, right: string) {
  if (left === right) return 1
  if (!left || !right) return 0
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return 1 - previous[right.length]! / Math.max(left.length, right.length)
}

function tokenSimilarity(left: string, right: string) {
  const leftTokens = new Set(left.split(' ').filter(Boolean))
  const rightTokens = new Set(right.split(' ').filter(Boolean))
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length
  return leftTokens.size + rightTokens.size === 0
    ? 0
    : (2 * shared) / (leftTokens.size + rightTokens.size)
}

export function suggestionScore(query: string, candidate: string) {
  const left = normalizeSuggestionTitle(query)
  const right = normalizeSuggestionTitle(candidate)
  if (!left || !right) return 0
  const edit = editSimilarity(left, right)
  const tokens = tokenSimilarity(left, right)
  const substring = left.length >= 3 && (left.includes(right) || right.includes(left)) ? 0.86 : 0
  return Math.max(edit, tokens * 0.78 + edit * 0.22, substring)
}

export function rankDuplicateSuggestions(
  title: string,
  candidates: readonly PublicFeedbackItem[],
) {
  return candidates
    .map((item) => ({ item, score: suggestionScore(title, item.title) }))
    .filter(({ score }) => score >= 0.62)
    .sort((left, right) =>
      right.score - left.score ||
      right.item.voteCount - left.item.voteCount ||
      left.item.title.localeCompare(right.item.title),
    )
    .slice(0, 3)
    .map(({ item }) => item)
}
