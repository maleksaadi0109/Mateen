import { useMutation, useQuery } from '@tanstack/react-query';
import hadiths from '../../../api-server/src/data/nawawi.json';

export const state = {
  saved: { textId: 'nawawi', currentHadith: 1, completedIds: [2], bookmarkedIds: [3] },
  writes: [] as unknown[],
};
export const getGetCatalogQueryKey = () => ['catalog'];
export const getGetStudyTextQueryKey = (_id: string) => ['text'];
export const getGetProgressQueryKey = () => ['progress'];
export const getGetDashboardQueryKey = () => ['dashboard'];
export const useGetCatalog = () => ({ data: [{id:'nawawi', title:'الأربعون النووية', status:'available'}] });
export const useGetStudyText = () => ({data: { title:'الأربعون النووية', sourceStatus:'retrieved_pending_review', hadiths }});
export const useGetProgress = () => useQuery({
  queryKey: getGetProgressQueryKey(), queryFn: async () => [{ ...state.saved }],
});
export const useSaveProgress = () => useMutation({
  mutationFn: async (input: {textId: string; data: typeof state.saved}) => {
    state.writes.push(input);
    state.saved = { ...input.data, textId: input.textId };
    return { ...state.saved };
  },
});