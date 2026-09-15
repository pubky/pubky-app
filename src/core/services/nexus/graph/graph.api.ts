import {
  GRAPH_PATH_PARAMS,
  type TGraphNeighborhoodParams,
  type TGraphPathParams,
} from '@/services/nexus/graph/graph.types';
import { buildNexusUrl, buildUrlWithQuery, encodePathSegment } from '@/services/nexus/nexus.utils';

/**
 * Graph API Endpoints
 *
 * Typed neighborhood graphs (nodes + edges) for the graph explorer.
 */

const PREFIX = 'v0/graph';

export const graphApi = {
  neighborhood: (params: TGraphNeighborhoodParams) => {
    const id = encodePathSegment(params.id);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/${params.kind}/${id}`,
      params,
      excludeKeys: [...GRAPH_PATH_PARAMS],
    });
  },
  path: (params: TGraphPathParams) =>
    buildNexusUrl(`${PREFIX}/path/${encodePathSegment(params.from)}/${encodePathSegment(params.to)}`),
};
