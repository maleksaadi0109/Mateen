import BookMascot from '@/components/mateen/book-mascot';

/** Mascot with speech bubble shown beside the current position on the path. */
export default function JourneyGuide({ message, mood = 'cheer' }: { message: string; mood?: 'cheer' | 'calm' | 'rest' }) {
  return (
    <div className="relative z-[1] mx-auto flex max-w-[24rem] items-end gap-3 py-2" data-testid="journey-guide">
      <BookMascot size={112} mood={mood} className="shrink-0" />
      <p className="relative mb-8 min-w-0 flex-1 rounded-2xl border bg-card px-4 py-2.5 font-ui text-sm font-semibold leading-6 shadow-sm before:absolute before:-right-2 before:bottom-3 before:h-4 before:w-4 before:rotate-45 before:border-b before:border-r before:bg-card before:content-['']">
        {message}
      </p>
    </div>
  );
}
