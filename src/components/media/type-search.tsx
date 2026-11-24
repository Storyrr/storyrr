import { SearchIcon } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

import { SearchResults } from "#/components/media/search-results";
import { InputGroup, InputGroupAddon, InputGroupInput } from "#/components/ui/input-group";
import { Label } from "#/components/ui/label";
import { useDebouncedValue } from "#/hooks/use-debounced-value";
import type { SearchableType } from "#/lib/media-types";

/**
 * The Books / Audiobooks page: a search field for that type only, and
 * `browse` (e.g. trending) while nothing is typed.
 */
export function TypeSearch({
  type,
  title,
  placeholder,
  query: initial,
  onQueryChange,
  browse,
}: {
  type: SearchableType;
  title: string;
  placeholder: string;
  query: string;
  /** Mirrors the query into the URL (shareable, back button). */
  onQueryChange: (query: string) => void;
  browse?: ReactNode;
}) {
  const [input, setInput] = useState(initial);
  const query = useDebouncedValue(input.trim(), 350);
  const inputId = useId();

  useEffect(() => {
    if (query !== initial) onQueryChange(query);
  }, [query, initial, onQueryChange]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <search>
        <form onSubmit={(event) => event.preventDefault()}>
          <Label htmlFor={inputId} className="sr-only">
            {placeholder}
          </Label>
          <InputGroup className="h-11">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              id={inputId}
              type="search"
              placeholder={placeholder}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              autoComplete="off"
            />
          </InputGroup>
        </form>
      </search>
      {query.length >= 2 ? <SearchResults type={type} query={query} titled={false} /> : browse}
    </div>
  );
}
