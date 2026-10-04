import BookMascot from '@/components/mateen/book-mascot';

/** Mascot with speech bubble shown beside the current position on the path. */
export default function JourneyGuide({ message, mood = 'cheer' }: { message: string; mood?: 'cheer' | 'calm' | 'rest' }) {
  return (
    <div className="mx-auto flex max-w-[22rem] items-end gap-3 py-2" data-testid="journey-guide">
      <BookMascot size={84} mood={mood} />
      <p className="relative mb-6 rounded-2xl border bg-card px-4 py-2.5 font-ui text-sm font-semibold leading-6 shadow-sm before:absolute before:-right-2 before:bottom-3 before:h-4 before:w-4 before:rotate-45 before:border-b before:border-r before:bg-card before:content-['']">
        {message}
      </p>
    </div>
  );
}
