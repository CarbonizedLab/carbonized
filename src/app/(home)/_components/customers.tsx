import Image from 'next/image';
import { Section } from '@/components/section';

interface StackItem {
  name: string;
  logo: string;
  /** Extra classes that make the logo readable in both themes. */
  tone: string;
  width: number;
}

const LOGO_HEIGHT = 22;

/** Black glyphs (Simple Icons, CC0) are inverted in dark mode. */
const MONO_TONE = 'opacity-80 dark:invert';

const stack: readonly StackItem[] = [
  {
    name: 'Robinhood Chain',
    logo: '/images/logos/robinhood.svg',
    tone: MONO_TONE,
    width: 22,
  },
  {
    name: 'Reown',
    logo: '/images/logos/reown.png',
    tone: 'invert opacity-80 dark:invert-0',
    width: 82,
  },
  {
    name: 'OpenZeppelin',
    logo: '/images/logos/openzeppelin.svg',
    tone: MONO_TONE,
    width: 22,
  },
  {
    name: 'wagmi',
    logo: '/images/logos/wagmi.svg',
    tone: MONO_TONE,
    width: 22,
  },
  {
    name: 'Next.js',
    logo: '/images/logos/nextdotjs.svg',
    tone: MONO_TONE,
    width: 22,
  },
  {
    name: 'Vercel',
    logo: '/images/logos/vercel.svg',
    tone: MONO_TONE,
    width: 22,
  },
  {
    name: 'Neon',
    logo: '/images/logos/neon.svg',
    tone: 'brightness-0 opacity-80 dark:invert',
    width: 22,
  },
];

export const Customers = () => {
  return (
    <Section className='relative flex flex-col items-center justify-between gap-8 p-6 py-8 sm:flex-row sm:gap-16 md:py-10'>
      <p className='text-muted-foreground sm:max-w-xs'>
        Built on open-source libraries and the networks we run on.
      </p>
      <ul className='grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 md:w-[60%]'>
        {stack.map((item) => (
          <li
            className='flex items-center gap-2.5 text-muted-foreground text-sm'
            key={item.name}
          >
            <Image
              alt=''
              aria-hidden='true'
              className={`h-[22px] w-auto shrink-0 ${item.tone}`}
              height={LOGO_HEIGHT}
              src={item.logo}
              unoptimized
              width={item.width}
            />
            <span>{item.name}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
};
