// Styles are injected once into <head>, shared by every <gev-showitems> item.
const componentStyles = `
.GEV-showItem-main-container {
    display: grid;
    min-height: 400px;
    width: 90vw;
    max-width: 1000px;
    margin: 0 auto 30px auto;
    border: 2px solid #fff;
    border-radius: 10%;
    overflow: hidden;
    box-shadow: 0 4px 10px rgba(0,0,0,0.1);
    &[data-direction="left"] {
        grid-template-columns: 250px 1fr;
        grid-template-areas: "img content";
        & .image-area {
            border-right: 2px solid black;
            border-left: none;
        }
    }
    &[data-direction="right"] {
        grid-template-columns: 1fr 250px;
        grid-template-areas: "content img";
        & .image-area {
            border-left: 2px solid #fff;
            border-right: none;
        }
    }
    & .image-area {
        grid-area: img;
        width: 35vw;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        object-fit: cover;
        color: #555;
        font-size: 2em;
        font-style: italic;
    }
    & .content-area {
        grid-area: content;
        display: grid;
        grid-template-rows: auto 1fr;
        & .title-cell {
            padding: 20px 40px;
            border-bottom: 2px solid black;
            color: #fff;
            font-size: 3em;
            font-weight: bold;
            align-self: end;
            margin: 0;
        }
        & .text-cell {
            padding: 40px;
            color: #fff;
            font-size: 1.5em;
            align-self: center;
            width: 100%;
            height: 100%;
            border: none;
            resize: none;
            background: transparent;
        }
    }
}
`;

// Template holds ONE item's markup. It is cloned once per person/item
// and filled in with that item's image/title/text.
const template = document.createElement('template');
template.innerHTML = `
<article class="GEV-showItem-main-container" data-direction="left">
    <img class="image-area article-Image" src="" alt="" />
    <section class="content-area">
        <h2 class="title-cell article-Title"></h2>
        <textarea class="text-cell article-Text"></textarea>
    </section>
</article>
`;

class GEV_ShowItems extends HTMLElement {
  constructor() {
    super();
  }

  static get observedAttributes() {
    return ['data-json'];
  }

  connectedCallback() {
    this.#injectStyles();

    // SSR / hydration check: if <article> elements are already present
    // (e.g. rendered server-side), leave them as-is rather than overwrite them.
    const alreadyRendered = this.querySelector('article') !== null;
    if (alreadyRendered) return;

    this.#renderFromAttribute();
  }

  // Re-render whenever the data-json attribute is set or updated —
  // this is what makes it work with data supplied *after* the element
  // is already in the page (e.g. once a DB/API response arrives).
  attributeChangedCallback(name) {
    if (name === 'data-json') this.#renderFromAttribute();
  }

  #renderFromAttribute() {
    const raw = this.getAttribute('data-json');
    if (!raw) return;

    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error('gev-showitems: invalid JSON in data-json attribute.', err);
      return;
    }

    this.#renderItems(data.people || []);
  }

  // Clones the <article> template once per item and fills in
  // the image / title / text fields for that item.
  #renderItems(people) {
    this.innerHTML = '';

    people.forEach((item, index) => {
      const fragment = template.content.cloneNode(true);
      const article = fragment.querySelector('article');
      const img = fragment.querySelector('.article-Image');
      const title = fragment.querySelector('.article-Title');
      const text = fragment.querySelector('.article-Text');

      // Alternate the layout left/right so a list of cards isn't monotonous.
      article.dataset.direction = index % 2 === 0 ? 'left' : 'right';

      img.src = item.image || '';
      img.alt = item.title || '';
      title.textContent = item.title || '';
      text.value = item.text || '';

      this.appendChild(fragment);
    });
  }

  // Injects the component's styles once per page, regardless of how many
  // <gev-showitems> instances exist.
  #injectStyles() {
    if (document.getElementById('gev-showitems-styles')) return;

    const style = document.createElement('style');
    style.id = 'gev-showitems-styles';
    style.textContent = componentStyles;
    document.head.appendChild(style);
  }
}

customElements.define('gev-showitems', GEV_ShowItems);