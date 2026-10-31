import { FaGithub, FaLinkedin } from 'react-icons/fa';
import { PeekingCat } from '@/components/brand/cat';
import { Reveal } from '@/components/motion/reveal';

const iconButtonClass =
  'flex size-11 items-center justify-center rounded-full border-[1.5px] border-copy text-copy transition-transform duration-200 hover:-translate-y-0.5';

export default function ContactSection() {
  return (
    <section id="contact" className="px-5 py-16 md:px-8 md:py-24">
      <Reveal variant="tilt" tilt="-1deg" className="relative mx-auto max-w-2xl">
        <PeekingCat className="absolute bottom-[calc(100%-1px)] left-[10%] hidden w-28 md:block" />
        <div className="note-card relative rounded-panel border border-rail-strong bg-platform-raised px-7 py-12 text-center md:px-12">
          <span className="note-tape" aria-hidden="true" />
          <p className="portal-label text-signal">[04] Say hello</p>
          <h2 className="portal-heading mt-3 text-3xl md:text-5xl">Got a question about a post, or about PawPress?</h2>
          <p className="mt-4 text-lg text-copy-muted">Email is the best way to reach me.</p>
          <div className="mt-8 flex flex-col items-center gap-5">
            <a href="mailto:34cats.dev@gmail.com" className="portal-button portal-button-primary">
              34cats.dev@gmail.com
            </a>
            <div className="flex gap-3">
              <a
                href="https://www.linkedin.com/in/sean-hardjanto-0b8874139/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn (opens in a new tab)"
                className={iconButtonClass}
              >
                <FaLinkedin aria-hidden="true" />
              </a>
              <a
                href="https://github.com/seanrh34"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub (opens in a new tab)"
                className={iconButtonClass}
              >
                <FaGithub aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
