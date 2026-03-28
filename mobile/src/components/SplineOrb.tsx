import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, getDisciplineColor } from '../theme';

const { width } = Dimensions.get('window');
const ORB_SIZE = width * 0.7;

interface SplineOrbProps {
  disciplineScore: number;
}

/**
 * SplineOrb Component
 * Displays the 3D Spline orb with a color overlay based on discipline score
 */
const SplineOrb: React.FC<SplineOrbProps> = ({ disciplineScore }) => {
  const disciplineColor = getDisciplineColor(disciplineScore);

  // The Spline scene URL
  const splineSceneUrl = 'https://prod.spline.design/Ib8sWt331LlmikRm/scene.splinecode';

  // Create HTML to embed Spline viewer
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          * { margin: 0; padding: 0; }
          html, body { 
            width: 100%; 
            height: 100%; 
            overflow: hidden;
            background: transparent;
          }
          #canvas3d {
            width: 120%;
            height: 120%;
            position: absolute;
            top: -10%;
            left: -10%;
            transform: scale(5.50);
          }
        </style>
      </head>
      <body>
        <canvas id="canvas3d"></canvas>
        <script type="module" src="https://unpkg.com/@splinetool/viewer@1.9.28/build/spline-viewer.js"></script>
        <script type="module">
          import { Application } from 'https://unpkg.com/@splinetool/runtime@1.9.28/build/runtime.js';
          
          const canvas = document.getElementById('canvas3d');
          const app = new Application(canvas);
          app.load('${splineSceneUrl}');
        </script>
      </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      {/* Glow effect based on discipline score */}
      <View
        style={[
          styles.glowOuter,
          { backgroundColor: disciplineColor, opacity: 0.15 },
        ]}
      />
      <View
        style={[
          styles.glowInner,
          { backgroundColor: disciplineColor, opacity: 0.1 },
        ]}
      />

      {/* Spline WebView */}
      <View style={styles.orbContainer}>
        <WebView
          source={{ html }}
          style={styles.webview}
          scrollEnabled={false}
          bounces={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={false}
          scalesPageToFit={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          originWhitelist={['*']}
        />

        {/* Color tint overlay */}
        <View
          style={[
            styles.colorOverlay,
            { backgroundColor: disciplineColor },
          ]}
          pointerEvents="none"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  glowOuter: {
    position: 'absolute',
    width: ORB_SIZE * 1.3,
    height: ORB_SIZE * 1.3,
    borderRadius: ORB_SIZE * 0.65,
  },
  glowInner: {
    position: 'absolute',
    width: ORB_SIZE * 1.15,
    height: ORB_SIZE * 1.15,
    borderRadius: ORB_SIZE * 0.575,
  },
  orbContainer: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  colorOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.12,
    borderRadius: ORB_SIZE / 2,
  },
});

export default SplineOrb;
