# Kubernetes Instructions

Create a secret for admin control. 
```
kubectl create secret generic bot-config --from-file=./admins.json --from-file=./botconfig.json
kubectl create secret generic ircon-config --from-file=./admins.json --from-file=./botconfig.json
```

Create a secret for backups. 
```
kubectl create secret generic backup-key --from-file=./ssh/id_rsa --from-file=./ssh/id_rsa.pub
```

Initialize the cluster. 
```
kubectl apply -f fleetbot.yaml
```

Copy database to cluster. 
```
kubectl cp database.sqlite <some-pod>:/bot/database.sqlite
```