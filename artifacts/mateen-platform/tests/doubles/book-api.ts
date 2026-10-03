const text = 'إنما الأعمال بالنيات';
const page = {page:3,width:652,height:964,imageUrl:'/api/mateen/recitation-page-images/3'};
export const getGetNawawiBookQueryKey = () => ['book'];
export const getGetRecitationPagesQueryKey = (id:number) => ['scan',id];
export const useGetNawawiBook = () => ({
  isLoading:false, isError:false, refetch:async () => {},
  data:{edition:'test',sourceUrl:'https://test.invalid',pages:[page],
    hadithPages:[{hadithId:1,firstPage:3,lastPage:3}]},
});
export const useGetRecitationPages = () => ({
  isLoading:false,isError:false,
  data:{status:'available',text,pages:[page],
    regions:[{page:3,x:355,y:383,width:40,height:43,wordIndices:[0]}],
    unmappedIndices:[1,2]},
});