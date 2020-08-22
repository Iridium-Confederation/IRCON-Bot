
FROM ubuntu:focal

RUN apt-get update 
RUN apt-get -y install curl sudo

# Install nodejs
RUN curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash -
RUN apt-get install -y nodejs

# Get source code
RUN apt-get install -y git

# Application dependencies
RUN apt-get install -y python3
COPY start.sh /
RUN chmod +x /start.sh
CMD /start.sh 
