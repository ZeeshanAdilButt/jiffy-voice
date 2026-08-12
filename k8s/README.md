# Kubernetes manifests

Deployment, Service, ConfigMap, Secret template, and a
HorizontalPodAutoscaler.

## Usage

```
cp k8s/secret.yaml.example k8s/secret.yaml
# fill in real values
kubectl apply -f k8s/secret.yaml
kubectl apply -k k8s/
```

Or from the repo root: `make k8s-deploy`. Validate without a cluster with
`make k8s-validate`.

`deployment.yaml` points at `jiffy-voice:latest`. Change it to your
registry path, or to the published image at
`ghcr.io/zeeshanadilbutt/jiffy-voice:<version>`.

## Notes

**Scaling.** Nothing coordinates between replicas and nothing needs to.
Every request carries the candidate list it wants resolved and is answered
from its own body, so a pod holds no state a later request depends on.
Adding replicas is the whole of horizontal scaling here, and losing one
costs nothing but the requests in flight on it.

**Probes.** Liveness hits `/health` and readiness hits `/ready`, but be
clear about what that buys today: this service has no dependency for
readiness to check that liveness has not already proved, so both answer
the same thing. They stay separate because the day this grows a dependency
is the day only one of them should start failing, and adding the split
then would mean editing a running Deployment rather than a config value.

**Resources.** Requests are small on purpose. A request is a table lookup
and some string comparison; there is no connection pool, no cache, and
nothing whose memory grows with traffic. Raise the CPU limit before the
memory one if you see throttling.

**Read-only root filesystem.** The container writes nothing to disk, so it
runs with `readOnlyRootFilesystem: true`. If you add a sidecar that needs
scratch space, mount an `emptyDir` for it rather than relaxing this.
