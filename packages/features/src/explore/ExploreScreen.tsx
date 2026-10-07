import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { AppText, Banner, Button, Chip, ListRow, Screen } from '@sanchay/ui';
import { useQuery } from '@tanstack/react-query';
import { ScrollView, View } from 'react-native';
import { useApi } from '../api/ApiContext';
import { useNav } from '../nav/NavContext';
import { Disclosures } from './Disclosures';

export interface ExploreScreenProps {
  category?: string | undefined;
}

/** EXP-01 (curated list) + EXP-03 (category tiles) + the EXP-02 search entry point. */
export function ExploreScreen({ category }: ExploreScreenProps) {
  const { utils } = useApi();
  const nav = useNav();
  const categories = useQuery(utils.catalogue.categories.queryOptions({ input: {} }));
  const list = useQuery(
    utils.catalogue.listSchemes.queryOptions({ input: { category, sort: 'name' } }),
  );

  if (list.isPending || categories.isPending) {
    return (
      <Screen testID="explore-loading">
        <AppText tone="muted">Loading funds…</AppText>
      </Screen>
    );
  }

  if (list.isError || categories.isError) {
    const err = list.error ?? categories.error;
    return (
      <Screen testID="explore-error">
        <Banner tone="error" message={messageForError(toApiError(err).code)} />
        <Button
          label="Try again"
          onPress={() => {
            void list.refetch();
            void categories.refetch();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen testID="explore-screen">
      <AppText variant="title">Explore funds</AppText>
      <Button label="Search" variant="secondary" onPress={() => nav.push('/explore/search')} />
      {!category ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {categories.data.map((c) => (
              <Chip
                key={c.code}
                label={c.name}
                selected={false}
                onPress={() => nav.push(`/explore/category/${c.slug}`)}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
      <View>
        {list.data.items.map((scheme) => (
          <ListRow
            key={scheme.isin}
            label={scheme.name}
            onPress={() => nav.push(`/funds/${scheme.slug}`)}
            testID={`scheme-row-${scheme.isin}`}
          />
        ))}
      </View>
      <Disclosures />
    </Screen>
  );
}
