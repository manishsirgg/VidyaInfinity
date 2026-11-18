export const INSTITUTE_DESCRIPTION_WORD_LIMIT = 250;
export const INSTITUTE_TAGLINE_CHARACTER_LIMIT = 120;

export function countInstituteDescriptionWords(value: string) {
  return value.match(/\S+/g)?.length ?? 0;
}

export function publicInstituteDescription(value: string | null | undefined) {
  const description = value?.trim() ?? "";
  const overflow = Array.from(description.matchAll(/\S+/g))[INSTITUTE_DESCRIPTION_WORD_LIMIT];
  return overflow ? `${description.slice(0, overflow.index).trimEnd()}…` : description;
}
