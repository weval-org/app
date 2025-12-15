'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CIPLogo from '@/components/icons/CIPLogo';
import Icon from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Fuse from 'fuse.js';
import { AutocompleteEntry } from '@/cli/types/cli_types';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
    { href: '/', label: 'Home' },
    { href: '#', label: 'Our Methodology', disabled: true },
    { href: '#', label: 'About Weval', disabled: true },
];

const ACTION_LINKS = [
    { href: '#', label: 'Suggest Eval', disabled: true },
    { href: '/sandbox', label: 'Create Eval', disabled: false, primary: true },
];

export function NavBarV2() {
    const router = useRouter();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [searchFocused, setSearchFocused] = useState(false);
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<AutocompleteEntry[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [fuse, setFuse] = useState<Fuse<AutocompleteEntry> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Load autocomplete index
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

    // Update suggestions
    useEffect(() => {
        if (!fuse || query.length < 2) {
            setSuggestions([]);
            return;
        }
        const results = fuse.search(query);
        setSuggestions(results.slice(0, 5).map(r => r.item));
        setSelectedIndex(-1);
    }, [query, fuse]);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setSearchFocused(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Escape key handling
    useEffect(() => {
        function handleEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setSearchFocused(false);
                setMobileMenuOpen(false);
                inputRef.current?.blur();
            }
        }
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, []);

    // Scroll selected into view
    useEffect(() => {
        if (selectedIndex >= 0 && listRef.current) {
            const el = listRef.current.children[selectedIndex] as HTMLElement;
            el?.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIndex]);

    const handleSelect = useCallback((entry: AutocompleteEntry) => {
        setQuery('');
        setSearchFocused(false);
        router.push(`/analysis/${entry.configId}`);
    }, [router]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const showDropdown = searchFocused && (suggestions.length > 0 || query.length > 2);

        if (!showDropdown) {
            if (e.key === 'Enter' && query.length > 2) {
                router.push(`/all?q=${encodeURIComponent(query)}`);
                setSearchFocused(false);
            }
            return;
        }

        const totalOptions = suggestions.length + (query.length > 2 ? 1 : 0);

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev => prev < totalOptions - 1 ? prev + 1 : prev);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
                    handleSelect(suggestions[selectedIndex]);
                } else if (query.length > 2) {
                    router.push(`/all?q=${encodeURIComponent(query)}`);
                    setSearchFocused(false);
                }
                break;
        }
    };

    const showDropdown = searchFocused && (suggestions.length > 0 || (query.length > 2 && !isLoading));
    const listboxId = 'navbar-search-listbox';
    const getOptionId = (idx: number) => `navbar-search-option-${idx}`;

    return (
        <>
            {/* Mobile search overlay */}
            {searchFocused && (
                <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 md:hidden">
                    <div className="p-4">
                        <div className="flex items-center gap-3 mb-4">
                            <button
                                onClick={() => {
                                    setSearchFocused(false);
                                    setQuery('');
                                }}
                                className="p-2 -ml-2 text-muted-foreground hover:text-foreground"
                                aria-label="Close search"
                            >
                                <Icon name="arrow-left" className="h-5 w-5" />
                            </button>
                            <span className="text-sm font-medium text-muted-foreground">Search evaluations</span>
                        </div>
                        <div ref={containerRef} className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Icon name="search" className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <Input
                                ref={inputRef}
                                type="search"
                                role="combobox"
                                aria-expanded={showDropdown}
                                aria-haspopup="listbox"
                                aria-controls={showDropdown ? listboxId : undefined}
                                aria-activedescendant={selectedIndex >= 0 ? getOptionId(selectedIndex) : undefined}
                                placeholder="Search..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="w-full pl-11 pr-4 py-3 text-base rounded-lg bg-white dark:bg-card"
                                autoFocus
                                autoComplete="off"
                            />
                            {showDropdown && (
                                <div className="absolute z-50 w-full mt-2 bg-white dark:bg-card border border-border rounded-lg shadow-xl max-h-[60vh] overflow-y-auto">
                                    <ul ref={listRef} role="listbox" id={listboxId} className="py-1">
                                        {suggestions.map((entry, idx) => (
                                            <li
                                                key={entry.configId}
                                                id={getOptionId(idx)}
                                                role="option"
                                                aria-selected={idx === selectedIndex}
                                            >
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        "w-full px-4 py-3 text-left hover:bg-muted/50",
                                                        idx === selectedIndex && "bg-muted"
                                                    )}
                                                    onClick={() => handleSelect(entry)}
                                                    tabIndex={-1}
                                                >
                                                    <div className="font-medium truncate">{entry.title}</div>
                                                    <div className="text-sm text-muted-foreground truncate">{entry.snippet}</div>
                                                </button>
                                            </li>
                                        ))}
                                        {query.length > 2 && (
                                            <li
                                                id={getOptionId(suggestions.length)}
                                                role="option"
                                                aria-selected={selectedIndex === suggestions.length}
                                            >
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        "w-full px-4 py-3 text-left text-sm hover:bg-muted/50 flex items-center gap-2 border-t border-border",
                                                        selectedIndex === suggestions.length && "bg-muted"
                                                    )}
                                                    onClick={() => {
                                                        router.push(`/all?q=${encodeURIComponent(query)}`);
                                                        setSearchFocused(false);
                                                    }}
                                                    tabIndex={-1}
                                                >
                                                    <Icon name="arrow-right" className="h-4 w-4" />
                                                    <span>Search for &quot;{query}&quot;</span>
                                                </button>
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile menu overlay */}
            {mobileMenuOpen && (
                <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 md:hidden">
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-6">
                            <Link href="/" className="flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
                                <CIPLogo className="w-8 h-8 text-foreground" />
                                <span className="text-2xl font-bold">
                                    <span style={{ fontWeight: 700 }}>w</span>
                                    <span style={{ fontWeight: 200 }}>eval</span>
                                </span>
                            </Link>
                            <button
                                onClick={() => setMobileMenuOpen(false)}
                                className="p-2 text-muted-foreground hover:text-foreground"
                                aria-label="Close menu"
                            >
                                <Icon name="x" className="h-6 w-6" />
                            </button>
                        </div>
                        <nav className="space-y-1">
                            {NAV_LINKS.map(link => (
                                <Link
                                    key={link.label}
                                    href={link.href}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={cn(
                                        "block px-4 py-3 rounded-lg text-lg",
                                        link.disabled
                                            ? "text-muted-foreground cursor-not-allowed"
                                            : "hover:bg-muted"
                                    )}
                                    aria-disabled={link.disabled}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </nav>
                        <div className="border-t border-border my-4" />
                        <div className="space-y-2">
                            {ACTION_LINKS.map(link => (
                                <Link
                                    key={link.label}
                                    href={link.href}
                                    onClick={() => !link.disabled && setMobileMenuOpen(false)}
                                    className={cn(
                                        "block px-4 py-3 rounded-lg text-center",
                                        link.disabled
                                            ? "text-muted-foreground bg-muted/50 cursor-not-allowed"
                                            : link.primary
                                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                                : "bg-muted hover:bg-muted/80"
                                    )}
                                    aria-disabled={link.disabled}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Main navbar */}
            <header className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Left: Logo + Nav Links */}
                        <div className="flex items-center gap-6">
                            <Link href="/" className="flex items-center gap-2 shrink-0">
                                <CIPLogo className="w-8 h-8 text-foreground" />
                                <span className="text-xl font-bold hidden sm:inline">
                                    <span style={{ fontWeight: 700 }}>w</span>
                                    <span style={{ fontWeight: 200 }}>eval</span>
                                </span>
                            </Link>
                            <nav className="hidden md:flex items-center gap-1">
                                {NAV_LINKS.map(link => (
                                    <Link
                                        key={link.label}
                                        href={link.href}
                                        className={cn(
                                            "px-3 py-2 text-sm rounded-md transition-colors",
                                            link.disabled
                                                ? "text-muted-foreground cursor-not-allowed"
                                                : "hover:bg-muted hover:text-foreground text-muted-foreground"
                                        )}
                                        aria-disabled={link.disabled}
                                    >
                                        {link.label}
                                    </Link>
                                ))}
                            </nav>
                        </div>

                        {/* Center: Search (desktop) */}
                        <div ref={containerRef} className="hidden md:block flex-1 max-w-md mx-4 relative">
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    {isLoading ? (
                                        <Icon name="loader-2" className="h-4 w-4 text-muted-foreground animate-spin" />
                                    ) : (
                                        <Icon name="search" className="h-4 w-4 text-muted-foreground" />
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
                                    placeholder="Search evaluations..."
                                    value={query}
                                    onChange={(e) => {
                                        setQuery(e.target.value);
                                        setSearchFocused(true);
                                    }}
                                    onFocus={() => setSearchFocused(true)}
                                    onKeyDown={handleKeyDown}
                                    className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-muted/50 border-transparent focus:bg-white dark:focus:bg-card focus:border-border"
                                    disabled={isLoading}
                                    autoComplete="off"
                                />
                            </div>
                            {showDropdown && (
                                <div className="absolute z-50 w-full mt-2 bg-white dark:bg-card border border-border rounded-lg shadow-xl max-h-[400px] overflow-hidden">
                                    <ul ref={listRef} role="listbox" id={listboxId} className="py-1 overflow-y-auto max-h-[inherit]">
                                        {suggestions.length > 0 ? (
                                            suggestions.map((entry, idx) => (
                                                <li
                                                    key={entry.configId}
                                                    id={getOptionId(idx)}
                                                    role="option"
                                                    aria-selected={idx === selectedIndex}
                                                >
                                                    <button
                                                        type="button"
                                                        className={cn(
                                                            "w-full px-4 py-2.5 text-left hover:bg-muted/50 transition-colors",
                                                            idx === selectedIndex && "bg-muted"
                                                        )}
                                                        onClick={() => handleSelect(entry)}
                                                        onMouseEnter={() => setSelectedIndex(idx)}
                                                        tabIndex={-1}
                                                    >
                                                        <div className="font-medium text-sm truncate">{entry.title}</div>
                                                        <div className="text-xs text-muted-foreground truncate mt-0.5">{entry.snippet}</div>
                                                    </button>
                                                </li>
                                            ))
                                        ) : query.length > 2 ? (
                                            <li className="px-4 py-6 text-center text-muted-foreground text-sm">
                                                No matching evaluations
                                            </li>
                                        ) : null}
                                        {query.length > 2 && (
                                            <li
                                                id={getOptionId(suggestions.length)}
                                                role="option"
                                                aria-selected={selectedIndex === suggestions.length}
                                                className="border-t border-border"
                                            >
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        "w-full px-4 py-2.5 text-left text-sm hover:bg-muted/50 flex items-center gap-2 transition-colors",
                                                        selectedIndex === suggestions.length && "bg-muted"
                                                    )}
                                                    onClick={() => {
                                                        router.push(`/all?q=${encodeURIComponent(query)}`);
                                                        setSearchFocused(false);
                                                    }}
                                                    onMouseEnter={() => setSelectedIndex(suggestions.length)}
                                                    tabIndex={-1}
                                                >
                                                    <Icon name="arrow-right" className="h-4 w-4 text-muted-foreground" />
                                                    <span>Search for &quot;{query}&quot;</span>
                                                    <span className="text-muted-foreground">in all evaluations</span>
                                                </button>
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            )}
                        </div>

                        {/* Right: Action buttons (desktop) + Mobile controls */}
                        <div className="flex items-center gap-2">
                            {/* Mobile search button */}
                            <button
                                onClick={() => setSearchFocused(true)}
                                className="md:hidden p-2 text-muted-foreground hover:text-foreground"
                                aria-label="Search"
                            >
                                <Icon name="search" className="h-5 w-5" />
                            </button>

                            {/* Desktop action buttons */}
                            <div className="hidden md:flex items-center gap-2">
                                {ACTION_LINKS.map(link => (
                                    link.disabled ? (
                                        <Button
                                            key={link.label}
                                            variant="ghost"
                                            size="sm"
                                            disabled
                                            className="text-muted-foreground"
                                        >
                                            {link.label}
                                        </Button>
                                    ) : (
                                        <Button
                                            key={link.label}
                                            variant={link.primary ? "default" : "ghost"}
                                            size="sm"
                                            asChild
                                        >
                                            <Link href={link.href}>{link.label}</Link>
                                        </Button>
                                    )
                                ))}
                            </div>

                            {/* Mobile menu button */}
                            <button
                                onClick={() => setMobileMenuOpen(true)}
                                className="md:hidden p-2 text-muted-foreground hover:text-foreground"
                                aria-label="Open menu"
                            >
                                <Icon name="menu" className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>
        </>
    );
}
