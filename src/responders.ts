import type { KickEvent, Responder, Utterance } from './types';
import type { Settings } from './settings';
import { cleanText } from './text';

/** Reads the event itself. Filtering happens before; final safety check after. */
export class DirectResponder implements Responder {
  constructor(private settings: () => Settings) {}

  respond(e: KickEvent): Utterance[] {
    const s = this.settings();
    const said = (raw: string | undefined) => {
      const body = cleanText(raw ?? '', s.maxLength);
      return body && s.readUsername ? `${e.username}: ${body}` : body;
    };
    let text = '';
    switch (e.type) {
      case 'chat':
        text = said(e.text);
        break;
      case 'reward':
        text = said(e.text) || said(e.rewardTitle);
        break;
      case 'kicks':
        text = said(e.text) || `${e.username} ${e.amount ?? ''} KICK göndərdi`;
        break;
      case 'sub':
        text = `${e.username} abunə oldu`;
        break;
      case 'giftsub':
        text = `${e.username} ${e.amount ?? 1} abunəlik hədiyyə etdi`;
        break;
    }
    return text ? [{ text, priority: e.type === 'chat' ? 3 : 1, kind: e.type }] : [];
  }
}
