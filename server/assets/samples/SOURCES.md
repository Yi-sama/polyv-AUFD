# Sample Image Sources

Reused from the project's previously downloaded Unsplash derivatives on
2026-10-24. No image represents the user or a fictional creator's real identity,
work, attendance or endorsement. All three creators are explicitly fictional.
Avatars use scene photographs, not impersonated portraits.

License: https://unsplash.com/license
Local derivatives: JPEG, maximum width 1800 px.

| File | Photographer | Original source |
|---|---|---|
| stage.jpg | Product School | https://unsplash.com/photos/GhAFNoNc1vk |
| audience.jpg | Product School | https://unsplash.com/photos/phlc0v-lcvw |
| panel.jpg | Product School | https://unsplash.com/photos/dJICd7b_LlE |
| conversation.jpg | Product School | https://unsplash.com/photos/cLY8gZwGdmY |
| workshop.jpg | Product School | https://unsplash.com/photos/VRbfqglJbcE |
| architecture.jpg | Joel Filipe | https://unsplash.com/photos/7kjeW-xwArI |
| facade.jpg | Joel Filipe | https://unsplash.com/photos/GI_-TWgI5ao |
| structure.jpg | Joel Filipe | https://unsplash.com/photos/Z8-32lPNGpY |

Stock photographs remain illustrative licensed samples, not creator-owned work.
Do not imply endorsement by pictured people or organizations.

## Generated Technical Video

`../aufd-integration-20261024.mp4` is a 12-second synthetic FFmpeg test pattern
with a generated sine tone, created for account integration testing. It contains
no people, personal materials or third-party footage. It is not a fictional
creator's real work, and is distinct from the Polyv official demo VID.

Reproduction:

```sh
ffmpeg -f lavfi -i testsrc2=size=640x360:rate=24 \
  -f lavfi -i sine=frequency=440:sample_rate=44100 -t 12 \
  -c:v libx264 -preset fast -crf 28 -pix_fmt yuv420p \
  -c:a aac -b:a 64k -movflags +faststart \
  -metadata "title=AUFD generated integration test" aufd-integration-20261024.mp4
```
