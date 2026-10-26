export interface Observation {
  id: string;
  label: string;
  text: string;
  kind: "text" | "image";
}

export class ObservationLog {
  readonly #observations = new Map<string, Observation>();

  record(
    label: string,
    text: string,
    kind: Observation["kind"] = "text",
  ): Observation {
    const observation = {
      id: `O${this.#observations.size + 1}`,
      label,
      text,
      kind,
    };
    this.#observations.set(observation.id, observation);
    return observation;
  }

  contains(id: string, quote: string): boolean {
    const observation = this.#observations.get(id);
    const needle = normalize(quote);
    if (observation?.kind !== "text" || needle.length === 0) return false;
    return [observation.text, withoutLineNumbers(observation.text)].some(
      (text) => normalize(text).includes(needle),
    );
  }
}

export function render(observation: Observation): string {
  return `[${observation.id}] ${observation.label}\n${observation.text}`;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function withoutLineNumbers(text: string): string {
  return text.replace(/^ *\d+ \| ?/gm, "");
}
