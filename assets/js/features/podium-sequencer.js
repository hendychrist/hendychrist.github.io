/**
 * Podium Sequencer — scroll-driven zoom reveal into iPhone mockup video.
 *
 * Flow:
 *   - bg starts zoomed WAY in (scale 20) — fills entire viewport
 *   - phone starts zoomed in too (scale 3) — big, filling viewport center
 *   - scroll zooms bg OUT (20→1) AND phone OUT (3→1) together
 *   - phone stays perfectly centered during the zoom-out
 *   - video plays immediately on load, loops continuously
 */

export function initPodiumSequencer({ gsap, ScrollTrigger }) {
	const section = document.getElementById('podium-sequencer');
	if (!section || !gsap || !ScrollTrigger) return false;

	const scene = section.querySelector('.podium-sequencer__scene');
	const bg = scene?.querySelector('.podium-sequencer__bg');
	const iphone = scene?.querySelector('.podium-sequencer__iphone');
	const video = iphone?.querySelector('.podium-sequencer__video');
	const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

	if (!scene || !bg || !iphone || reduceMotion) return false;

	gsap.registerPlugin(ScrollTrigger);

	// ─── Constants ──���
	const BG_SCALE_START = 20;
	const BG_SCALE_END = 1;
	const PHONE_SCALE_START = 2.25;
	const PHONE_SCALE_END = 0.74;
	const SCROLL_DISTANCE = 200;

	// ─── Initial state ───
	// BG: centered, scale 20 — extreme zoom covering viewport
	gsap.set(bg, {
		xPercent: -50,
		yPercent: -50,
		scale: BG_SCALE_START,
		transformOrigin: 'center center',
	});

	// Phone: CSS flexbox centers it — GSAP only handles scale (no x/y offset)
	gsap.set(iphone, {
		scale: 2.25,
		transformOrigin: 'center center',
	});

	// ─── Timeline ───
	// GSAP pins the scene — scroll drives bg zoom + phone zoom together
	const zoomTL = gsap.timeline({
		scrollTrigger: {
			trigger: scene,
			start: 'top top',
			end: `+=${SCROLL_DISTANCE}%`,
			scrub: 0.8,
			pin: true,
			invalidateOnRefresh: true,
		}
	});

	// 1) BG: zoom OUT from scale 20 → 1 (reveals full podium room)
	zoomTL.to(bg, {
		scale: BG_SCALE_END,
		ease: 'power2.out',
		duration: 1,
	}, 0);

	// 2) Phone: zoom OUT from scale 2 → 0.6 (shrinks to museum-wall size)
	zoomTL.to(iphone, {
		scale: PHONE_SCALE_END,
		ease: 'power2.out',
		duration: 1,
	}, 0);

	// Video: plays immediately, no scroll sync
		if (video) {
			video.play().catch(() => {});
		}

	// ─── Resize ───
	let raf = 0;
	window.addEventListener('resize', () => {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(() => ScrollTrigger.refresh());
	}, { passive: true });

	return true;
}
