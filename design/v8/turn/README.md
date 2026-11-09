# v8 turn / chat art (generic seated body)
All sprites face RIGHT; mirror (scaleX -1 on the whole sprite, not a squash) for left. Transparent PNG, painted style.
| file | use |
|---|---|
| t0-back.png | seated, back to camera (default at desk) |
| t1-3q-back.png | 3/4 back, turning toward neighbour |
| t2-side.png | profile |
| t3-3q-front.png | 3/4 front |
| t4-front.png | facing camera (break / lounge) |
| chat-right.png | chatting pose toward right neighbour (drawn at a LARGER scale: scale so chair base width matches t2-side) |
| chair-back.png / chair-front.png | empty chair, for empty seats if baked chairs are erased |
Turn = step through t0→t1→t2 (→t3/t4) at ~120–160 ms per frame, ease in/out, never scaleX-squash.
Frames t0–t4 share one scale and chair base (bottom edge aligned); anchor = bottom-centre of the chair base.
NOT DONE: per-bot head/hat composites + hoodie recolour (plan: crop each bot's head from f??/w?? busts — back head on t0/t1, front head on t3/t4/chat, side head lightly compressed — and tint the grey hoodie to the bot's torso colour). Baked plate chairs may double up under the sprite chair at side angles.
preview.jpg = contact sheet of all frames.
