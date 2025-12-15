'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import Icon from '@/components/ui/icon';
import Fuse from 'fuse.js';
import { AutocompleteEntry } from '@/cli/types/cli_types';

interface SearchAutocompleteProps {
    placeholder?: string;
    className?: string;
}

export function SearchAutocomplete({
    placeholder = 'Search evaluations...',
    className = '',
}: SearchAutocompleteProps) {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [suggestions, setSuggestions] = useState<AutocompleteEntry[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [fuse, setFuse] = useState<Fuse<AutocompleteEntry> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Load the autocomplete index on mount
    useEffect(() => {
        async function loadIndex() {
            try {
                const response = await fetch('/api/autocomplete');
                if (response.ok) {
                    const data = await response.json();
                    setFuse(new Fuse(data, {
                        keys: [
                            { name: 'title', weight: 2 },
                            { name: 'keywords', weight: 1.5 },
                            { name: 'tags', weight: 1.2 },
                            { name: 'snippet', weight: 0.8 },
                            { name: 'domain', weight: 1 },
                            { name: 'topModel', weight: 0.5 },
                        ],
                        threshold: 0.4,
                        includeScore: true,
                        minMatchCharLength: 2,
                        ignoreLocation: true,
                    }));
                }
            } catch (error) {
                console.error('Failed to load autocomplete index:', error);
            } finally {
                setIsLoading(false);
            }
        }
        loadIndex();
    }, []);

    // Update suggestions when query changes
    useEffect(() => {
        if (!fuse || query.length < 2) {
            setSuggestions([]);
            return;
        }

        const results = fuse.search(query);
        setSuggestions(results.slice(0, 6).map(r => r.item));
        setSelectedIndex(-1);
    }, [query, fuse]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setIsFocused(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Handle escape key to close mobile fullscreen
    useEffect(() => {
        function handleEscape(event: KeyboardEvent) {
            if (event.key === 'Escape' && isFocused) {
                setIsOpen(false);
                setIsFocused(false);
                inputRef.current?.blur();
            }
        }
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isFocused]);

    // Scroll selected item into view
    useEffect(() => {
        if (selectedIndex >= 0 && listRef.current) {
            const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
            selectedElement?.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIndex]);

    const handleSelect = useCallback((entry: AutocompleteEntry) => {
        setQuery('');
        setIsOpen(false);
        setIsFocused(false);
        router.push(`/analysis/${entry.configId}`);
    }, [router]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen || suggestions.length === 0) {
            if (e.key === 'Enter' && query.length > 2) {
                router.push(`/all?q=${encodeURIComponent(query)}`);
                setIsOpen(false);
                setIsFocused(false);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev < suggestions.length ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
                    handleSelect(suggestions[selectedIndex]);
                } else if (selectedIndex === suggestions.length && query.length > 2) {
                    // "Search all" option selected
                    router.push(`/all?q=${encodeURIComponent(query)}`);
                    setIsOpen(false);
                    setIsFocused(false);
                } else if (query.length > 2) {
                    router.push(`/all?q=${encodeURIComponent(query)}`);
                    setIsOpen(false);
                    setIsFocused(false);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                setIsFocused(false);
                inputRef.current?.blur();
                break;
        }
    };

    const handleFocus = () => {
        setIsOpen(true);
        setIsFocused(true);
    };

    const handleClose = () => {
        setIsOpen(false);
        setIsFocused(false);
        setQuery('');
        inputRef.current?.blur();
    };

    const showDropdown = isOpen && (suggestions.length > 0 || (query.length > 2 && !isLoading));

    // Generate unique IDs for accessibility
    const listboxId = 'search-autocomplete-listbox';
    const getOptionId = (index: number) => `search-option-${index}`;

    return (
        <>
            {/* Mobile fullscreen overlay */}
            {isFocused && (
                <div
                    className="fixed inset-0 bg-background/95 backdrop-blur-sm z-40 md:hidden"
                    aria-hidden="true"
                />
            )}

            <div
                ref={containerRef}
                className={`relative w-full ${className} ${
                    isFocused ? 'fixed inset-x-0 top-0 z-50 p-4 md:relative md:inset-auto md:p-0 md:z-auto' : ''
                }`}
            >
                {/* Mobile header with close button */}
                {isFocused && (
                    <div className="flex items-center gap-3 mb-3 md:hidden">
                        <button
                            onClick={handleClose}
                            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Close search"
                        >
                            <Icon name="arrow-left" className="h-5 w-5" />
                        </button>
                        <span className="text-sm font-medium text-muted-foreground">Search evaluations</span>
                    </div>
                )}

                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                        {isLoading ? (
                            <Icon name="loader-2" className="h-5 w-5 text-muted-foreground animate-spin" />
                        ) : (
                            <Icon name="search" className="h-5 w-5 text-muted-foreground" />
                        )}
                    </div>
                    <Input
                        ref={inputRef}
                        type="search"
                        role="combobox"
                        aria-expanded={showDropdown}
                        aria-haspopup="listbox"
                        aria-controls={showDropdown ? listboxId : undefined}
                        aria-activedescendant={selectedIndex >= 0 ? getOptionId(selectedIndex) : undefined}
                        aria-autocomplete="list"
                        placeholder={placeholder}
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={handleFocus}
                        onKeyDown={handleKeyDown}
                        className="w-full text-base md:text-lg py-7 pl-14 pr-4 rounded-xl shadow-lg bg-white dark:bg-card ring-1 ring-border/50 focus:ring-2 focus:ring-primary"
                        disabled={isLoading}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck="false"
                    />
                </div>

                {showDropdown && (
                    <div
                        className={`
                            absolute z-50 w-full mt-2 bg-white dark:bg-card border border-border rounded-xl shadow-xl overflow-hidden
                            ${isFocused ? 'max-h-[calc(100vh-140px)] md:max-h-[400px]' : 'max-h-[400px]'}
                        `}
                        role="listbox"
                        id={listboxId}
                        aria-label="Search suggestions"
                    >
                        <div className="overflow-y-auto max-h-[inherit]">
                            {suggestions.length > 0 ? (
                                <ul ref={listRef} className="py-2">
                                    {suggestions.map((entry, idx) => (
                                        <li
                                            key={entry.configId}
                                            id={getOptionId(idx)}
                                            role="option"
                                            aria-selected={idx === selectedIndex}
                                        >
                                            <button
                                                type="button"
                                                className={`w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors focus:outline-none focus:bg-muted/50 ${
                                                    idx === selectedIndex ? 'bg-muted' : ''
                                                }`}
                                                onClick={() => handleSelect(entry)}
                                                onMouseEnter={() => setSelectedIndex(idx)}
                                                tabIndex={-1}
                                            >
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium text-foreground truncate">
                                                            {entry.title}
                                                        </div>
                                                        <div className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                                                            {entry.snippet}
                                                        </div>
                                                        {entry.tags.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-2">
                                                                {entry.tags.slice(0, 3).map(tag => (
                                                                    <span
                                                                        key={tag}
                                                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground"
                                                                    >
                                                                        {tag}
                                                                    </span>
                                                                ))}
                                                                {entry.tags.length > 3 && (
                                                                    <span className="text-xs text-muted-foreground">
                                                                        +{entry.tags.length - 3}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {entry.score !== undefined && (
                                                        <div className="flex-shrink-0 text-right">
                                                            <div className="text-sm font-medium text-primary">
                                                                {Math.round(entry.score * 100)}%
                                                            </div>
                                                            {entry.topModel && (
                                                                <div className="text-xs text-muted-foreground truncate max-w-[100px]">
                                                                    {entry.topModel}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : query.length > 2 ? (
                                <div className="px-4 py-8 text-center text-muted-foreground">
                                    <Icon name="search-x" className="h-10 w-10 mx-auto mb-3 opacity-50" />
                                    <p className="font-medium">No matching evaluations found</p>
                                    <p className="text-sm mt-1">Try different keywords</p>
                                </div>
                            ) : null}

                            {query.length > 2 && (
                                <div className="border-t border-border">
                                    <button
                                        type="button"
                                        id={getOptionId(suggestions.length)}
                                        role="option"
                                        aria-selected={selectedIndex === suggestions.length}
                                        className={`w-full px-4 py-3 text-left text-sm hover:bg-muted/50 transition-colors flex items-center gap-2 focus:outline-none focus:bg-muted/50 ${
                                            selectedIndex === suggestions.length ? 'bg-muted' : ''
                                        }`}
                                        onClick={() => {
                                            router.push(`/all?q=${encodeURIComponent(query)}`);
                                            setIsOpen(false);
                                            setIsFocused(false);
                                        }}
                                        onMouseEnter={() => setSelectedIndex(suggestions.length)}
                                        tabIndex={-1}
                                    >
                                        <Icon name="arrow-right" className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-foreground">Search for &quot;{query}&quot;</span>
                                        <span className="text-muted-foreground">in all evaluations</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
