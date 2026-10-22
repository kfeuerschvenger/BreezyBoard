import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { IconUser, IconX } from '@tabler/icons-react';
import type { User as UserModel } from '@/models';
import { Avatar, Icon } from '@/shared/ui';
import type { FieldControlProps } from '@/shared/ui';
import { useUser } from '../queries';

export interface UserPickerProps {
  /** Supplied by the Field that labels this control: id, aria-invalid, aria-describedby. */
  controlProps?: FieldControlProps;
  /** The id of the selected user, or an empty string when none is selected. */
  value: string;
  onChange: (value: string) => void;
  /** The candidates to search. Filtering is local, over this list. */
  members: UserModel[];
}

const MAX_SUGGESTIONS = 10;
const MIN_QUERY_LENGTH = 2;
const FILTER_DEBOUNCE_MS = 220;

const fullNameOf = (user: UserModel): string => `${user.firstName} ${user.lastName}`.trim();

/**
 * Picks one user out of a list, as a combobox over a listbox of options.
 *
 * Focus never leaves the input: the highlight moves with `aria-activedescendant`
 * rather than with focus, which is what the combobox pattern asks for and what
 * stops the typing being taken away from the person doing it.
 */
export const UserPicker: React.FC<UserPickerProps> = ({ value, onChange, members, controlProps }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<UserModel[]>([]);
  const [isFiltering, setIsFiltering] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserModel | null>(null);
  const debounceRef = useRef<number | null>(null);
  // Which suggestion the keyboard is on. -1 means none, which is also the
  // state a mouse user is always in.
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const memberMatch = useMemo(
    () => (value ? (members.find(member => String(member._id) === String(value)) ?? null) : null),
    [value, members]
  );

  // The selected user is not necessarily on the list being searched, so the
  // record is fetched when the list does not hold it. The query lives in the
  // feature rather than here because a component may not reach the network.
  const shouldFetchOwner = Boolean(value) && !memberMatch;
  const { data: fetchedUser, isFetching: isFetchingOwner, isError } = useUser(shouldFetchOwner ? value : null);

  const resolvedUser = memberMatch ?? (value ? (fetchedUser ?? null) : null);

  useEffect(() => {
    if (!value) {
      setSelectedUser(null);
      setSearchTerm('');
      return;
    }

    if (resolvedUser) {
      setSelectedUser(resolvedUser);
      setSearchTerm(fullNameOf(resolvedUser));
      setSuggestions([]);
      return;
    }

    // An id that resolves to nothing leaves the control empty rather than
    // displaying an id, which is not a name and cannot be corrected by typing.
    if (isError) {
      setSelectedUser(null);
      setSearchTerm('');
      setSuggestions([]);
    }
  }, [value, resolvedUser, isError]);

  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    const query = searchTerm.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsFiltering(false);
      return;
    }

    // The name of the already selected user is not a search for somebody
    // else, so it does not reopen the list under what was just chosen.
    if (selectedUser) {
      const fullName = fullNameOf(selectedUser);
      if (query === fullName.toLowerCase() || query === fullName) {
        setSuggestions([]);
        setIsFiltering(false);
        return;
      }
    }

    setIsFiltering(true);
    debounceRef.current = window.setTimeout(() => {
      const lowerCaseQuery = query.toLowerCase();
      const filtered = members.filter(member => {
        const fullName = fullNameOf(member).toLowerCase();
        return (
          fullName.includes(lowerCaseQuery) ||
          (member.email && member.email.toLowerCase().includes(lowerCaseQuery)) ||
          (member.role && String(member.role).toLowerCase().includes(lowerCaseQuery))
        );
      });
      setSuggestions(filtered.slice(0, MAX_SUGGESTIONS));
      setIsFiltering(false);
    }, FILTER_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [searchTerm, members, selectedUser]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  const handleSelectUser = (user: UserModel) => {
    setSelectedUser(user);
    setSearchTerm(fullNameOf(user));
    setSuggestions([]);
    onChange(user._id);
  };

  /**
   * Down and up move the highlight, Enter takes it, Escape dismisses the list
   * without clearing what was typed. Enter is only intercepted while a
   * suggestion is highlighted, so it still submits the form otherwise.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(previous => (previous + 1) % suggestions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(previous => (previous <= 0 ? suggestions.length - 1 : previous - 1));
      return;
    }

    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      handleSelectUser(suggestions[activeIndex]);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setSuggestions([]);
    }
  };

  const handleInputChange = (inputValue: string) => {
    if (selectedUser && inputValue !== fullNameOf(selectedUser)) {
      setSelectedUser(null);
      onChange('');
    }
    setSearchTerm(inputValue);
  };

  const handleClear = () => {
    setSelectedUser(null);
    setSearchTerm('');
    setSuggestions([]);
    onChange('');
  };

  return (
    <div className="relative">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Icon as={IconUser} size={16} className="text-ink-tertiary" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={event => handleInputChange(event.target.value)}
          placeholder="Search team members..."
          className={`h-12 w-full rounded-field border-[1.5px] bg-surface pl-10 pr-11 text-[15px] text-ink transition-[border-color,box-shadow] duration-200 placeholder:text-ink-tertiary focus:border-focus focus:shadow-focus focus:outline-none ${
            controlProps?.['aria-invalid'] ? 'border-danger' : 'border-line-control'
          }`}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          onKeyDown={handleKeyDown}
          {...controlProps}
        />
        {selectedUser && (
          <button
            type="button"
            onClick={handleClear}
            className="focus-ring absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-field text-ink-secondary hover:text-ink"
            aria-label="Clear selected user"
          >
            <Icon as={IconX} size={16} />
          </button>
        )}
      </div>

      {suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Matching team members"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-control border border-line-12 bg-surface shadow-tile-hover"
        >
          {suggestions.map((user, index) => (
            // The option carries the click handler and the role, and the
            // input keeps the focus throughout, which is what the combobox
            // pattern asks for: aria-activedescendant above points here
            // rather than focus moving into the list.
            //
            // The rule below wants a keyboard handler on whatever is
            // clickable, and following it here would make the component
            // worse. Options in a combobox are never focused, so a key
            // handler on one could not fire; the keyboard lives on the input
            // and is covered by its own tests. This is the rule failing to
            // see a pattern rather than the pattern being wrong, which is
            // the only reason worth silencing one for.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={user._id}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              className={`flex cursor-pointer items-center gap-3 p-3 ${
                index === activeIndex ? 'bg-sky-tint' : 'hover:bg-line-06'
              }`}
              onClick={() => handleSelectUser(user)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <Avatar
                name={`${user.firstName ?? ''} ${user.lastName ?? ''}`}
                src={user.avatar}
                seed={user._id}
                size="sm"
                decorative
              />
              <div>
                <p className="font-medium text-ink">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-sm text-ink-secondary">{user.email}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(isFiltering || isFetchingOwner) && (
        <div className="absolute z-10 mt-1 w-full rounded-control border border-line-12 bg-surface p-3 shadow-tile-hover">
          <p className="text-center text-ink-secondary">Searching users...</p>
        </div>
      )}
    </div>
  );
};

export default UserPicker;
