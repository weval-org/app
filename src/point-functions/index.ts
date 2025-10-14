import { PointFunction } from './types';
import { contains } from './contains';
import { matches } from './matches';
import { is_json } from './is_json';
import { starts_with } from './starts_with';
import { word_count_between } from './word_count_between';
import { contains_any_of } from './contains_any_of';
import { icontains } from './icontains';
import { imatches } from './imatches';
import { ends_with } from './ends_with';
import { contains_all_of } from './contains_all_of';
import { matches_all_of } from './matches_all_of';
import { imatch_all_of } from './imatch_all_of';
import { contains_at_least_n_of } from './contains_at_least_n_of';
import { icontains_at_least_n_of } from './icontains_at_least_n_of';
import { matches_at_least_n_of } from './matches_at_least_n_of';
import { imatch_at_least_n_of } from './imatch_at_least_n_of';
import { icontains_all_of } from './icontains_all_of';
import { icontains_any_of } from './icontains_any_of';
import { istarts_with } from './istarts_with';
import { iends_with } from './iends_with';
import { js } from './js';
import { tool_called } from './tool_called';
import { tool_args_match } from './tool_args_match';
import { tool_call_count_between } from './tool_call_count_between';
import { tool_call_order } from './tool_call_order';

export const pointFunctions: Record<string, PointFunction> = {
    contains,
    contain: contains,
    matches,
    match: matches,
    is_json,
    starts_with,
    ends_with,
    word_count_between,
    contains_any_of,
    contains_all_of,
    contain_all_of: contains_all_of,
    matches_all_of,
    match_all_of: matches_all_of,
    imatch_all_of,
    icontains,
    icontain: icontains,
    imatches,
    imatch: imatches,
    icontains_all_of,
    icontain_all_of: icontains_all_of,
    icontains_any_of,
    icontain_any_of: icontains_any_of,
    istarts_with,
    istart_with: istarts_with,
    iends_with,
    iend_with: iends_with,
    contains_at_least_n_of,
    contain_at_least_n_of: contains_at_least_n_of,
    icontains_at_least_n_of,
    icontain_at_least_n_of: icontains_at_least_n_of,
    matches_at_least_n_of,
    match_at_least_n_of: matches_at_least_n_of,
    imatch_at_least_n_of,
    js,
    expr: js,
    tool_called,
    tool_args_match,
    tool_call_count_between,
    tool_call_order,
};