FROM ubuntu:focal

RUN apt-get update 
RUN apt-get -y install curl sudo

# Install nodejs
RUN curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash -
RUN apt-get install -y nodejs

# Get source code
RUN apt-get install -y git
RUN git clone https://github.com/Iridium-Confederation/IRCON-Bot.git /bot 

# Application dependencies
WORKDIR /bot
RUN apt-get install -y python3
RUN npm install
RUN npm run build
COPY start.sh /
RUN chmod +x /start.sh
CMD /start.sh 
