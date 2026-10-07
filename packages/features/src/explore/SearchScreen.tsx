import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { AppText, Banner, ListRow, Screen, TextField } from '@sanchay/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi } from '../api/ApiContext';
import { useNav } from '../nav/NavContext';

/** EXP-04 (search box) / EXP-05 (results). Only queries once at least one character is typed. */
export function SearchScreen() {
  const { utils } = useApi();
  const nav = useNav();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const results = useQuery({
    ...utils.catalogue.listSchemes.queryOptions({
      input: { q: trimmed || undefined, sort: 'name' },
    }),
    enabled: trimmed.length > 0,
  });

  return (
    <Screen testID="search-screen">
      <AppText variant="title">Search funds</AppText>
      <TextField
        label="Search funds"
        value={query}
        onChangeText={setQuery}
        placeholder="e.g. Flexi Cap, Axis, Liquid"
      />
      {results.isError ? (
        <Banner tone="error" message={messageForError(toApiError(results.error).code)} />
      ) : null}
      {trimmed.length > 0 && results.isSuccess && results.data.items.length === 0 ? (
        <AppText tone="muted">No funds found for &ldquo;{trimmed}&rdquo;.</AppText>
      ) : null}
      {results.data?.items.map((scheme) => (
        <ListRow
          key={scheme.isin}
          label={scheme.name}
          onPress={() => nav.push(`/funds/${scheme.slug}`)}
          testID={`scheme-row-${scheme.isin}`}
        />
      ))}
    </Screen>
  );
}
