# Third-party notices

## MediaPipe Tasks Vision

CoachPoint uses `@mediapipe/tasks-vision` and the MediaPipe Pose Landmarker Lite
model for browser-local pose landmark detection.

- Project: https://developers.google.com/mediapipe
- Package: https://www.npmjs.com/package/@mediapipe/tasks-vision
- License: Apache License 2.0

The runtime WASM files in `public/mediapipe/wasm/` are copied from the installed
package so the competition demo does not depend on a third-party CDN at run
time. The model in `public/models/pose_landmarker_lite.task` is the official
MediaPipe Pose Landmarker Lite float16 model.
