# Kubernetes Instructions

Create a secret for admin control. 
```
kubectl create secret generic bot-config --from-file=./admins.json --from-file=./botconfig.json
```

Initialize the cluster. 
```
kubectl apply -f fleetbot.yaml
```

Copy database to cluster (new method) 
```
// In a DM with the bot, upload the database and specify this comment. 
!fb db 
```

