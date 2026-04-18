import { useRef, useEffect, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { vertexShader, fragmentShader } from "./tunnelShader";

interface TunnelMeshProps {
  interactive?: boolean;
  speed?: number;
}

function TunnelMesh({ interactive = false, speed = 1.0 }: TunnelMeshProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const mouseRef = useRef(new THREE.Vector2(0.5, 0.5));
  const { size } = useThree();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    }),
    [size.width, size.height],
  );

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uResolution.value.set(
        size.width * window.devicePixelRatio,
        size.height * window.devicePixelRatio,
      );
    }
  }, [size]);

  useEffect(() => {
    if (!interactive) return;

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.set(e.clientX / window.innerWidth, 1.0 - e.clientY / window.innerHeight);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [interactive]);

  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = clock.getElapsedTime() * speed;
    if (interactive) {
      materialRef.current.uniforms.uMouse.value.lerp(mouseRef.current, 0.05);
    }
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

interface TunnelSceneProps {
  interactive?: boolean;
  speed?: number;
  className?: string;
}

export function TunnelScene({
  interactive = false,
  speed = 1.0,
  className = "",
}: TunnelSceneProps) {
  return (
    <Canvas
      className={className}
      camera={{ position: [0, 0, 1] }}
      dpr={[1, 2]}
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      }}
      style={{ background: "#020205" }}
    >
      <TunnelMesh interactive={interactive} speed={speed} />
    </Canvas>
  );
}
